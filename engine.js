/**
 * engine.js — VLA Annuity Quotation Tool
 * Generates a complete quotation object from client inputs.
 *
 * Key assumptions (aligned to VLA product terms):
 *   Net interest rate : 12.00% p.a. effective
 *   Initial loading   : 2.50% of consideration (deducted before pricing)
 *   Funeral cover     : priced as whole-life assurance at same rate
 *   Guarantee period  : 0 / 5 / 10 years certain
 *   Funeral tiers     : 0 / 100,000 / 200,000 / 300,000 / 500,000 MWK
 */

'use strict';

// ── Configuration ─────────────────────────────────────────────────────────────
const VLA_I_RATE     = 0.12;   // 12% p.a. net interest rate
const VLA_LOAD_PCT   = 0.025;  // 2.5% initial charge on purchase price
const VLA_MAX_AGE    = 115;    // Maximum age in life table
const FUNERAL_COVERS = [0, 100000, 200000, 300000, 500000]; // MWK per tier
const GUARANTEES     = [0, 5, 10];                           // years certain

// Payments per year
const FREQ_M = { Monthly: 12, Quarterly: 4, 'Half-yearly': 2, Annual: 1 };

// ── Main entry point ──────────────────────────────────────────────────────────
function generateQuote(inp) {
  const iRate = VLA_I_RATE;
  const dRate = iRate / (1 + iRate);
  const m     = FREQ_M[inp.frequency] || 12;

  // Exact age ≈ ANB − 0.5  (midpoint approximation; ANB = age last birthday + 1)
  const anb1     = computeANB(new Date(inp.dob1));
  const exactAge1 = anb1 - 0.5;

  // Net fund after loading
  const grossAfterCharges = inp.initialConsideration * (1 - VLA_LOAD_PCT);

  const basis   = inp.basisName;
  const timing  = inp.paymentTiming;  // 'Advance' | 'Arrear'
  const isJoint = inp.annuityStructure === 'Reversionary last survivor';
  const isFixed = inp.annuityStructure === 'Fixed term';

  // Second life (if applicable)
  let exactAge2 = null;
  if (isJoint && inp.dob2) {
    exactAge2 = computeANB(new Date(inp.dob2)) - 0.5;
  }

  // Whole-life assurance factor for funeral benefit pricing
  const Ax = _wholeLifeAx(exactAge1, inp.gender1, basis, iRate);

  // ── Annuity factors for the three guarantee periods ────────────────────────
  let singleFactors, jointFactors;

  singleFactors = GUARANTEES.map(g =>
    _lifeAnnuityFactorM(exactAge1, inp.gender1, basis, iRate, m, timing, g));

  if (isFixed) {
    jointFactors = GUARANTEES.map(() =>
      _fixedTermFactorM(inp.fixedPeriod, iRate, m, timing));
  } else if (isJoint && exactAge2 !== null) {
    jointFactors = GUARANTEES.map(g =>
      _reversionaryFactorM(
        exactAge1, inp.gender1,
        exactAge2, inp.gender2,
        basis, iRate, m, timing, g, inp.reversionPct));
  } else {
    jointFactors = singleFactors.slice(); // same as single for non-joint
  }

  // ── Build results matrix (5 funeral tiers × 3 guarantee periods) ──────────
  const results = [];
  for (let tier = 0; tier < 5; tier++) {
    const funeralCover = FUNERAL_COVERS[tier];
    const funeralPV    = funeralCover * Ax;
    const netForAnnuity = Math.max(0, grossAfterCharges - funeralPV);

    GUARANTEES.forEach((guarantee, gIdx) => {
      const annuityFactorM = isFixed || (isJoint && exactAge2 !== null)
        ? jointFactors[gIdx]
        : singleFactors[gIdx];

      const perInstalmentAnnuity = annuityFactorM > 0
        ? netForAnnuity / annuityFactorM
        : 0;

      results.push({ funeralTier: tier, guarantee, annuityFactorM, perInstalmentAnnuity, funeralCover });
    });
  }

  return {
    anb1,
    annuityStructure: inp.annuityStructure,
    basisName: basis,
    iRate,
    dRate,
    m,
    Ax,
    grossAfterCharges,
    singleFactors,
    jointFactors,
    results,
    generatedAt: new Date().toISOString()
  };
}

// ── m × ä^(m)_{x:g|}  — life annuity factor scaled by m ────────────────────
// This is the "price" of an annuity paying 1 MWK per instalment:
//   perInstalmentAnnuity = netFund / annuityFactorM
//   annualIncome = m × perInstalmentAnnuity
//
// guarantee = 0  →  pure life annuity (no certainty period)
// guarantee > 0  →  guaranteed g years certain, then life thereafter

function _lifeAnnuityFactorM(x, gender, basis, iRate, m, timing, guarantee) {
  const v  = 1 / (1 + iRate);
  const dt = 1 / m;
  let factor = 0;

  const maxK = Math.floor((VLA_MAX_AGE - x) * m);

  for (let k = 0; k <= maxK; k++) {
    const t    = k * dt;
    const disc = Math.pow(v, t);

    if (t < guarantee) {
      // Guaranteed payment — no mortality discount
      factor += disc;
    } else {
      // Life-contingent payment
      factor += disc * tPx(x, t, gender, basis);
    }
  }

  // Arrear adjustment: remove the time-0 payment (paid at end of first period, not start)
  if (timing === 'Arrear') factor -= 1;

  return factor;
}

// ── Fixed-term annuity factor ─────────────────────────────────────────────────
// No mortality; pays for exactly `years` years.
function _fixedTermFactorM(years, iRate, m, timing) {
  const v  = 1 / (1 + iRate);
  const dt = 1 / m;
  let factor = 0;

  const start = timing === 'Arrear' ? 1 : 0;
  const end   = timing === 'Arrear' ? years * m : years * m - 1;

  for (let k = start; k <= end; k++) {
    factor += Math.pow(v, k * dt);
  }
  return factor;
}

// ── Reversionary joint-life annuity factor ────────────────────────────────────
// Pays 1/instalment while x is alive; revPct/instalment thereafter to y.
// EPV = ä_x + revPct × (ä_y − ä_{xy})
//
// With guarantee: guarantee applies to primary life only.

function _reversionaryFactorM(x1, g1, x2, g2, basis, iRate, m, timing, guarantee, revPct) {
  const factorX  = _lifeAnnuityFactorM(x1, g1, basis, iRate, m, timing, guarantee);
  const factorY  = _lifeAnnuityFactorM(x2, g2, basis, iRate, m, timing, 0);
  const factorXY = _jointLifeFactorM(x1, g1, x2, g2, basis, iRate, m, timing, guarantee);

  // Reversionary to y: ä_{y|x} = ä_y − ä_{xy}  (annuity that commences on death of x)
  const reversionary = Math.max(0, factorY - factorXY);
  return factorX + revPct * reversionary;
}

// ── Joint life (both alive) annuity factor ────────────────────────────────────
function _jointLifeFactorM(x1, g1, x2, g2, basis, iRate, m, timing, guarantee) {
  const v    = 1 / (1 + iRate);
  const dt   = 1 / m;
  const maxT = Math.min(VLA_MAX_AGE - x1, VLA_MAX_AGE - x2);
  let factor = 0;

  for (let k = 0; k <= maxT * m; k++) {
    const t    = k * dt;
    const disc = Math.pow(v, t);

    if (t < guarantee) {
      factor += disc;
    } else {
      factor += disc * tPx(x1, t, g1, basis) * tPx(x2, t, g2, basis);
    }
  }

  if (timing === 'Arrear') factor -= 1;
  return factor;
}

// ── Whole-life assurance EPV  A_x ────────────────────────────────────────────
// Used to cost the funeral benefit: PV(funeral cover) = cover × A_x
// Approximation: death occurs at middle of each year of age.

function _wholeLifeAx(x, gender, basis, iRate) {
  const v = 1 / (1 + iRate);
  let ax  = 0;

  for (let age = Math.floor(x); age < VLA_MAX_AGE; age++) {
    const t   = age - x;
    const spx = tPx(x, t, gender, basis);
    const qx  = getQx(age, gender, basis);
    // Death assumed mid-year  → discount v^(t + 0.5)
    ax += Math.pow(v, t + 0.5) * spx * qx;
  }

  return ax;
}
