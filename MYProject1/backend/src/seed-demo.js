require('dotenv').config();
const bcrypt = require('bcryptjs');
const mysql = require('mysql2/promise');
const { profileSchema } = require('./validation');

const demoMembers = [
  {
    email: 'demo.maya@maitri.local', phone: '+15550100001',
    profile: {
      first_name: 'Maya', last_name: 'Shah', gender: 'Female', date_of_birth: '1996-06-17',
      height_cm: 165, religion: 'Hindu', caste_community: 'Gujarati', gothram: '', rasi: '',
      star_nakshatram: '', mother_tongue: 'English', native_district: 'Toronto, Ontario',
      current_city: 'Toronto', education: 'Design', profession: 'Product designer',
      annual_income: 92000, family_details: 'Close-knit family based in Ontario.',
      profile_photo_url: '', bio: 'Enjoys architecture, weekend markets and long walks.',
    },
  },
  {
    email: 'demo.arjun@maitri.local', phone: '+15550100002',
    profile: {
      first_name: 'Arjun', last_name: 'Mehta', gender: 'Male', date_of_birth: '1993-02-18',
      height_cm: 178, religion: 'Hindu', caste_community: 'Gujarati', gothram: '', rasi: '',
      star_nakshatram: '', mother_tongue: 'English', native_district: 'Toronto, Ontario',
      current_city: 'Toronto', education: 'Computer science', profession: 'Software engineer',
      annual_income: 118000, family_details: 'Values time with family and friends.',
      profile_photo_url: '', bio: 'Curious, kind, and usually planning the next hiking trip.',
    },
  },
  {
    email: 'demo.amina@maitri.local', phone: '+15550100003',
    profile: {
      first_name: 'Amina', last_name: 'Rahman', gender: 'Female', date_of_birth: '1997-10-20',
      height_cm: 162, religion: 'Muslim', caste_community: '', gothram: '', rasi: '',
      star_nakshatram: '', mother_tongue: 'English', native_district: 'London, England',
      current_city: 'London', education: 'Public health', profession: 'Researcher',
      annual_income: 68000, family_details: 'Family is spread across London and Manchester.',
      profile_photo_url: '', bio: 'Loves museums, cooking for friends and finding quiet bookshops.',
    },
  },
  {
    email: 'demo.noah@maitri.local', phone: '+15550100004',
    profile: {
      first_name: 'Noah', last_name: 'Bennett', gender: 'Male', date_of_birth: '1992-03-11',
      height_cm: 183, religion: 'Christian', caste_community: '', gothram: '', rasi: '',
      star_nakshatram: '', mother_tongue: 'English', native_district: 'Toronto, Ontario',
      current_city: 'Toronto', education: 'Environmental science', profession: 'Urban planner',
      annual_income: 86000, family_details: 'One sibling; enjoys hosting family dinners.',
      profile_photo_url: '', bio: 'Thoughtful, outdoorsy and hopeful about building a life together.',
    },
  },
];

async function seedDemoMembers() {
  const password = process.env.DEMO_PASSWORD;
  if (!password || password.length < 12) throw new Error('Set DEMO_PASSWORD to at least 12 characters for the sample accounts.');
  const passwordHash = await bcrypt.hash(password, 12);
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'maitri_matrimony',
  });

  try {
    for (const member of demoMembers) {
      const parsed = profileSchema.safeParse(member.profile);
      if (!parsed.success) throw new Error(`Invalid sample profile ${member.email}: ${parsed.error.issues[0].message}`);
      await connection.beginTransaction();
      try {
        await connection.execute(
          `INSERT INTO users (email, password_hash, phone, account_status)
           VALUES (?, ?, ?, 'Active')
           ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash), phone = VALUES(phone), account_status = 'Active'`,
          [member.email, passwordHash, member.phone],
        );
        const [users] = await connection.execute('SELECT id FROM users WHERE email = ? LIMIT 1', [member.email]);
        const columns = [
          'first_name', 'last_name', 'gender', 'date_of_birth', 'height_cm', 'religion',
          'caste_community', 'gothram', 'rasi', 'star_nakshatram', 'mother_tongue',
          'native_district', 'current_city', 'education', 'profession', 'annual_income',
          'family_details', 'profile_photo_url', 'bio',
        ];
        const updates = columns.map((column) => `${column} = VALUES(${column})`).join(', ');
        await connection.execute(
          `INSERT INTO profiles (user_id, ${columns.join(', ')})
           VALUES (?, ${columns.map(() => '?').join(', ')})
           ON DUPLICATE KEY UPDATE ${updates}`,
          [users[0].id, ...columns.map((column) => parsed.data[column] ?? null)],
        );
        await connection.commit();
      } catch (error) {
        await connection.rollback();
        throw error;
      }
    }
    console.log(`Seeded ${demoMembers.length} fictional demo member profiles.`);
  } finally {
    await connection.end();
  }
}

seedDemoMembers().catch((error) => {
  console.error('Demo seed failed:', error.message);
  process.exitCode = 1;
});
