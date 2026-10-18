const { z } = require('zod');

const optionalText = (max) => z.string().trim().max(max).transform((value) => value || null);
const registerSchema = z.object({
  email: z.email().max(255).transform((value) => value.toLowerCase()),
  password: z.string().min(8).max(128),
  phone: z.string().trim().min(7).max(30),
});
const loginSchema = z.object({ email: z.email().max(255), password: z.string().min(1).max(128) });
const accountStatusSchema = z.object({ accountStatus: z.enum(['Active', 'Suspended']) });
const profileSchema = z.object({
  first_name: z.string().trim().min(1).max(100),
  last_name: z.string().trim().min(1).max(100),
  gender: z.enum(['Male', 'Female', 'Other']),
  date_of_birth: z.iso.date().refine((date) => {
    const birthday = new Date(`${date}T00:00:00`);
    const adultCutoff = new Date();
    adultCutoff.setFullYear(adultCutoff.getFullYear() - 18);
    return birthday <= adultCutoff;
  }, 'You must be at least 18 years old.'),
  height_cm: z.number().int().min(120).max(230).nullable().optional(),
  religion: z.string().trim().min(1).max(60),
  caste_community: optionalText(120),
  gothram: optionalText(120),
  rasi: optionalText(60),
  star_nakshatram: optionalText(60),
  mother_tongue: z.string().trim().min(1).max(60),
  native_district: z.string().trim().min(1).max(80),
  current_city: z.string().trim().min(1).max(120),
  education: optionalText(160),
  profession: optionalText(160),
  annual_income: z.number().nonnegative().nullable().optional(),
  family_details: optionalText(5000),
  profile_photo_url: z.union([
    z.literal(''),
    z.url().max(500).refine((value) => ['http:', 'https:'].includes(new URL(value).protocol)),
  ]).transform((value) => value || null),
  bio: optionalText(3000),
});
const interestSchema = z.object({ receiverUserId: z.coerce.number().int().positive() });
const responseSchema = z.object({ status: z.enum(['Accepted', 'Declined']) });
const subscriptionPaymentSchema = z.object({
  planId: z.coerce.number().int().positive(),
  transactionReference: z.string().trim().min(4).max(120),
});
const paymentReviewSchema = z.object({
  status: z.enum(['Approved', 'Rejected']),
  reviewNote: optionalText(500).optional(),
});
const planPriceSchema = z.object({
  amount: z.coerce.number().positive().max(99999999),
  currency: z.string().trim().length(3).transform((value) => value.toUpperCase()),
});
const searchSchema = z.object({
  gender: z.enum(['Male', 'Female', 'Other']).optional(),
  region: z.string().trim().max(80).optional(),
  page: z.coerce.number().int().min(1).optional(),
  minAge: z.coerce.number().int().min(18).max(100).optional(),
  maxAge: z.coerce.number().int().min(18).max(100).optional(),
  minHeight: z.coerce.number().int().min(120).max(230).optional(),
  maxHeight: z.coerce.number().int().min(120).max(230).optional(),
  education: z.string().trim().max(160).optional(),
  profession: z.string().trim().max(160).optional(),
  star: z.string().trim().max(60).optional(),
  rasi: z.string().trim().max(60).optional(),
}).superRefine((filters, context) => {
  if (filters.minAge !== undefined && filters.maxAge !== undefined && filters.minAge > filters.maxAge) {
    context.addIssue({ code: 'custom', message: 'Minimum age must not exceed maximum age.', path: ['minAge'] });
  }
  if (filters.minHeight !== undefined && filters.maxHeight !== undefined && filters.minHeight > filters.maxHeight) {
    context.addIssue({ code: 'custom', message: 'Minimum height must not exceed maximum height.', path: ['minHeight'] });
  }
});

module.exports = {
  accountStatusSchema,
  interestSchema,
  loginSchema,
  paymentReviewSchema,
  planPriceSchema,
  profileSchema,
  registerSchema,
  responseSchema,
  searchSchema,
  subscriptionPaymentSchema,
};
