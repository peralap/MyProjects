const test = require('node:test');
const assert = require('node:assert/strict');
const {
  accountStatusSchema,
  paymentReviewSchema,
  planPriceSchema,
  profileSchema,
  registerSchema,
  searchSchema,
  subscriptionPaymentSchema,
} = require('../src/validation');

function validProfile(overrides = {}) {
  return {
    first_name: 'Asha', last_name: 'Reddy', gender: 'Female', date_of_birth: '1995-04-12',
    height_cm: 164, religion: 'Hindu', caste_community: '', gothram: '', rasi: '',
    star_nakshatram: '', mother_tongue: 'English', native_district: 'Toronto, Ontario',
    current_city: 'Toronto', education: 'Engineering', profession: 'Designer',
    annual_income: 900000, family_details: '', profile_photo_url: '', bio: '',
    ...overrides,
  };
}

test('profile validation accepts regional profile data and normalizes optional text', () => {
  const result = profileSchema.safeParse(validProfile());
  assert.equal(result.success, true);
  if (result.success) assert.equal(result.data.gothram, null);
});

test('profile validation accepts locations outside the original region and rejects underage members', () => {
  const underage = profileSchema.safeParse(validProfile({ date_of_birth: '2012-01-01' }));
  const globalLocation = profileSchema.safeParse(validProfile({ native_district: 'Vancouver, Canada' }));
  assert.equal(underage.success, false);
  assert.equal(globalLocation.success, true);
  assert.equal(profileSchema.safeParse(validProfile({ profile_photo_url: 'javascript:alert(1)' })).success, false);
});

test('registration requires a strong-enough password and normalizes email', () => {
  const result = registerSchema.safeParse({ email: 'PERSON@EXAMPLE.COM', password: 'long-enough-password', phone: '+919876543210' });
  assert.equal(result.success, true);
  if (result.success) assert.equal(result.data.email, 'person@example.com');
  assert.equal(registerSchema.safeParse({ email: 'person@example.com', password: 'short', phone: '1234567' }).success, false);
});

test('search accepts free-text regions and rejects inverted bounds', () => {
  assert.equal(searchSchema.safeParse({ minAge: '35', maxAge: '21' }).success, false);
  const result = searchSchema.safeParse({ region: 'Ontario, Canada', page: '2', community: 'untrusted-filter' });
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.page, 2);
    assert.equal('community' in result.data, false);
  }
});

test('admin account status only permits activation and suspension', () => {
  assert.equal(accountStatusSchema.safeParse({ accountStatus: 'Active' }).success, true);
  assert.equal(accountStatusSchema.safeParse({ accountStatus: 'Suspended' }).success, true);
  assert.equal(accountStatusSchema.safeParse({ accountStatus: 'Pending' }).success, false);
});

test('subscription requests and payment reviews validate without accepting card data', () => {
  assert.equal(subscriptionPaymentSchema.safeParse({ planId: '1', transactionReference: 'bank-ref-1234' }).success, true);
  assert.equal(subscriptionPaymentSchema.safeParse({ planId: 1, transactionReference: 'x' }).success, false);
  assert.equal(paymentReviewSchema.safeParse({ status: 'Approved', reviewNote: 'Transfer verified' }).success, true);
  assert.equal(paymentReviewSchema.safeParse({ status: 'Paid' }).success, false);
  assert.equal(planPriceSchema.safeParse({ amount: '99', currency: 'inr' }).success, true);
});
