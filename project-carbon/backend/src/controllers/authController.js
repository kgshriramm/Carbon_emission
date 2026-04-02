const crypto = require("crypto");
const db = require("../config/db");
const { hashPassword, verifyPassword, signAuthToken } = require("../utils/security");

function requiredString(value, field) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${field} is required`);
  }
  return value.trim();
}

function hashMagicToken(rawToken) {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

function getMagicLinkBaseUrl(req) {
  if (process.env.MAGIC_LINK_BASE_URL) {
    return process.env.MAGIC_LINK_BASE_URL;
  }
  const protocol = req.protocol || "http";
  const host = req.get("host") || "localhost:4000";
  return `${protocol}://${host}`;
}

async function ensureDefaultPlans(client) {
  await client.query(
    `
    INSERT INTO plans (code, name, price_amount, price_currency, billing_interval, features_json, is_active)
    VALUES
      ('free', 'Free', 0, 'USD', 'monthly', '{"reports_per_month": 2, "team_members": 2}', TRUE),
      ('demo', 'Demo', 0, 'USD', 'monthly', '{"reports_per_month": 20, "team_members": 5, "demo": true}', TRUE),
      ('starter', 'Starter', 99, 'USD', 'monthly', '{"reports_per_month": 50, "team_members": 10}', TRUE)
    ON CONFLICT (code) DO NOTHING
    `
  );
}

async function createSubscriptionForCompany(client, companyId, planCode, status = "active") {
  const planResult = await client.query("SELECT id FROM plans WHERE code = $1 AND is_active = TRUE", [planCode]);
  if (!planResult.rows[0]) {
    throw new Error(`Plan not found: ${planCode}`);
  }

  const planId = Number(planResult.rows[0].id);
  await client.query(
    `
    INSERT INTO subscriptions (
      company_id, plan_id, status, current_period_start, current_period_end, cancel_at_period_end
    )
    VALUES ($1, $2, $3, NOW(), NOW() + INTERVAL '30 days', FALSE)
    `,
    [companyId, planId, status]
  );
}

async function register(req, res, next) {
  let client;
  try {
    client = await db.getClient();
    const body = req.body || {};
    const email = requiredString(body.email, "email").toLowerCase();
    const password = requiredString(body.password, "password");
    const fullName = requiredString(body.fullName, "fullName");

    await client.query("BEGIN");

    const exists = await client.query("SELECT id FROM users WHERE email = $1", [email]);
    if (exists.rows[0]) {
      throw new Error("Email already registered");
    }

    const passwordHash = hashPassword(password);
    const userResult = await client.query(
      `
      INSERT INTO users (email, password_hash, full_name, role)
      VALUES ($1, $2, $3, 'exporter_admin')
      RETURNING id, email, full_name, role
      `,
      [email, passwordHash, fullName]
    );

    const user = userResult.rows[0];

    if (body.companyName) {
      const companyResult = await client.query(
        `
        INSERT INTO companies (company_name, country_code, sector, created_by)
        VALUES ($1, $2, $3, $4)
        RETURNING id
        `,
        [
          requiredString(body.companyName, "companyName"),
          (body.countryCode || "IN").toUpperCase(),
          body.sector || null,
          Number(user.id)
        ]
      );

      const companyId = Number(companyResult.rows[0].id);

      await client.query(
        `
        INSERT INTO company_users (company_id, user_id, membership_role)
        VALUES ($1, $2, 'owner')
        `,
        [companyId, Number(user.id)]
      );

      await ensureDefaultPlans(client);
      await createSubscriptionForCompany(client, companyId, "free", "active");
    }

    await client.query("COMMIT");

    const token = signAuthToken({ userId: Number(user.id), email: user.email });

    return res.status(201).json({
      success: true,
      data: {
        token,
        user: {
          id: Number(user.id),
          email: user.email,
          fullName: user.full_name,
          role: user.role
        }
      }
    });
  } catch (error) {
    if (client) {
      await client.query("ROLLBACK");
    }
    return next(error);
  } finally {
    if (client) {
      client.release();
    }
  }
}

async function login(req, res, next) {
  try {
    const body = req.body || {};
    const email = requiredString(body.email, "email").toLowerCase();
    const password = requiredString(body.password, "password");

    const result = await db.query(
      `
      SELECT id, email, full_name, role, password_hash, is_active
      FROM users
      WHERE email = $1
      `,
      [email]
    );

    const user = result.rows[0];
    if (!user || !user.is_active || !verifyPassword(password, user.password_hash)) {
      return res.status(401).json({ success: false, message: "Invalid credentials" });
    }

    const token = signAuthToken({ userId: Number(user.id), email: user.email });

    return res.status(200).json({
      success: true,
      data: {
        token,
        user: {
          id: Number(user.id),
          email: user.email,
          fullName: user.full_name,
          role: user.role
        }
      }
    });
  } catch (error) {
    return next(error);
  }
}

async function requestMagicLink(req, res, next) {
  let client;
  try {
    client = await db.getClient();
    const body = req.body || {};
    const email = requiredString(body.email, "email").toLowerCase();

    const userResult = await client.query(
      `
      SELECT id, email, full_name, role, is_active
      FROM users
      WHERE email = $1
      `,
      [email]
    );

    const user = userResult.rows[0];

    if (!user || !user.is_active) {
      return res.status(200).json({
        success: true,
        message: "If the email exists, a magic link has been generated."
      });
    }

    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = hashMagicToken(rawToken);

    await client.query(
      `
      INSERT INTO magic_login_tokens (user_id, token_hash, expires_at)
      VALUES ($1, $2, NOW() + INTERVAL '15 minutes')
      `,
      [Number(user.id), tokenHash]
    );

    const baseUrl = getMagicLinkBaseUrl(req);
    const magicLink = `${baseUrl}/magic-login?token=${rawToken}`;

    return res.status(201).json({
      success: true,
      data: {
        message: "Magic link generated.",
        magicLink,
        token: rawToken,
        expiresInMinutes: 15
      }
    });
  } catch (error) {
    return next(error);
  } finally {
    if (client) {
      client.release();
    }
  }
}

async function verifyMagicLink(req, res, next) {
  let client;
  try {
    client = await db.getClient();
    const body = req.body || {};
    const token = requiredString(body.token, "token");
    const tokenHash = hashMagicToken(token);

    await client.query("BEGIN");

    const tokenResult = await client.query(
      `
      SELECT mlt.id, mlt.user_id, u.email, u.full_name, u.role, u.is_active
      FROM magic_login_tokens mlt
      JOIN users u ON u.id = mlt.user_id
      WHERE mlt.token_hash = $1
        AND mlt.used_at IS NULL
        AND mlt.expires_at > NOW()
      LIMIT 1
      `,
      [tokenHash]
    );

    const row = tokenResult.rows[0];
    if (!row || !row.is_active) {
      await client.query("ROLLBACK");
      return res.status(401).json({ success: false, message: "Invalid or expired magic link" });
    }

    const markUsed = await client.query(
      `
      UPDATE magic_login_tokens
      SET used_at = NOW()
      WHERE id = $1 AND used_at IS NULL
      RETURNING id
      `,
      [Number(row.id)]
    );

    if (!markUsed.rows[0]) {
      await client.query("ROLLBACK");
      return res.status(401).json({ success: false, message: "Magic link already used" });
    }

    await client.query("COMMIT");

    const authToken = signAuthToken({ userId: Number(row.user_id), email: row.email });

    return res.status(200).json({
      success: true,
      data: {
        token: authToken,
        user: {
          id: Number(row.user_id),
          email: row.email,
          fullName: row.full_name,
          role: row.role
        }
      }
    });
  } catch (error) {
    if (client) {
      await client.query("ROLLBACK");
    }
    return next(error);
  } finally {
    if (client) {
      client.release();
    }
  }
}

async function demoLogin(req, res, next) {
  let client;
  try {
    client = await db.getClient();
    await client.query("BEGIN");

    const suffix = crypto.randomBytes(4).toString("hex");
    const email = `demo_${Date.now()}_${suffix}@demo.projectcarbon.local`;
    const passwordPlain = crypto.randomBytes(8).toString("hex");
    const passwordHash = hashPassword(passwordPlain);

    const userResult = await client.query(
      `
      INSERT INTO users (email, password_hash, full_name, role)
      VALUES ($1, $2, $3, 'exporter_admin')
      RETURNING id, email, full_name, role
      `,
      [email, passwordHash, "Demo User"]
    );

    const user = userResult.rows[0];

    const companyResult = await client.query(
      `
      INSERT INTO companies (company_name, country_code, sector, created_by)
      VALUES ($1, 'IN', 'steel', $2)
      RETURNING id
      `,
      [`Demo Export Co ${suffix}`, Number(user.id)]
    );
    const companyId = Number(companyResult.rows[0].id);

    await client.query(
      `INSERT INTO company_users (company_id, user_id, membership_role) VALUES ($1, $2, 'owner')`,
      [companyId, Number(user.id)]
    );

    await ensureDefaultPlans(client);
    await createSubscriptionForCompany(client, companyId, "demo", "trialing");

    const factoryResult = await client.query(
      `
      INSERT INTO factories (company_id, factory_name, country_code, city)
      VALUES ($1, 'Demo Plant', 'IN', 'Chennai')
      RETURNING id
      `,
      [companyId]
    );
    const factoryId = Number(factoryResult.rows[0].id);

    const productResult = await client.query(
      `
      INSERT INTO products (company_id, factory_id, product_name, cbam_category, default_production_unit)
      VALUES ($1, $2, 'Demo Steel Coil', 'iron_steel', 'tonne')
      RETURNING id
      `,
      [companyId, factoryId]
    );
    const productId = Number(productResult.rows[0].id);

    const periodResult = await client.query(
      `
      INSERT INTO reporting_periods (company_id, period_label, period_start, period_end, period_type, status)
      VALUES ($1, 'Demo Period', CURRENT_DATE - INTERVAL '30 days', CURRENT_DATE, 'monthly', 'open')
      RETURNING id
      `,
      [companyId]
    );
    const reportingPeriodId = Number(periodResult.rows[0].id);

    await client.query(
      `
      INSERT INTO activity_data (company_id, factory_id, product_id, reporting_period_id, activity_type, quantity, unit, metadata, source_note, created_by)
      VALUES
        ($1, $2, $3, $4, 'electricity_kwh', 20000, 'kwh', '{"geographyCode":"GLOBAL"}', 'Demo electricity input', $5),
        ($1, $2, $3, $4, 'fuel_liters', 5000, 'liter', '{"geographyCode":"GLOBAL"}', 'Demo fuel input', $5)
      `,
      [companyId, factoryId, productId, reportingPeriodId, Number(user.id)]
    );

    await client.query("COMMIT");

    const token = signAuthToken({ userId: Number(user.id), email: user.email });

    return res.status(201).json({
      success: true,
      data: {
        token,
        user: {
          id: Number(user.id),
          email: user.email,
          fullName: user.full_name,
          role: user.role
        },
        demoWorkspace: {
          companyId,
          factoryId,
          productId,
          reportingPeriodId,
          generatedPassword: passwordPlain
        }
      }
    });
  } catch (error) {
    if (client) {
      await client.query("ROLLBACK");
    }
    return next(error);
  } finally {
    if (client) {
      client.release();
    }
  }
}

async function me(req, res, next) {
  try {
    const userId = req.user.id;

    const membershipsResult = await db.query(
      `
      SELECT cu.company_id, cu.membership_role, c.company_name, c.country_code,
             s.status AS subscription_status, p.code AS plan_code, p.name AS plan_name
      FROM company_users cu
      JOIN companies c ON c.id = cu.company_id
      LEFT JOIN LATERAL (
        SELECT *
        FROM subscriptions s2
        WHERE s2.company_id = cu.company_id
        ORDER BY s2.created_at DESC
        LIMIT 1
      ) s ON TRUE
      LEFT JOIN plans p ON p.id = s.plan_id
      WHERE cu.user_id = $1
      ORDER BY cu.company_id ASC
      `,
      [userId]
    );

    return res.status(200).json({
      success: true,
      data: {
        user: req.user,
        memberships: membershipsResult.rows.map((row) => ({
          companyId: Number(row.company_id),
          companyName: row.company_name,
          countryCode: row.country_code,
          membershipRole: row.membership_role,
          subscriptionStatus: row.subscription_status,
          planCode: row.plan_code,
          planName: row.plan_name
        }))
      }
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  register,
  login,
  requestMagicLink,
  verifyMagicLink,
  demoLogin,
  me
};

