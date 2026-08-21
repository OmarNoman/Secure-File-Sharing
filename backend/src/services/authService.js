const crypto = require("crypto");

const jwt = require("jsonwebtoken");
const { PutCommand, GetCommand } = require("@aws-sdk/lib-dynamodb");

const { getDynamoClient, getUsersTableName } = require("../config/dynamo");
const { getJwtSecret, getJwtExpirySeconds } = require("../config/auth");

const SCRYPT_KEYLEN = 64;
const MIN_USERNAME_LENGTH = 3;
const MAX_USERNAME_LENGTH = 50;
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 128;

// Hashed once at module load so login always pays the scrypt cost, even for unknown
// usernames, to avoid the DB lookup alone revealing which usernames exist by timing.
const DUMMY_PASSWORD_HASH = hashPassword("not-a-real-password-used-for-timing-safety");

function createInputError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  error.isUserInputError = true;
  return error;
}

function createAuthError(message) {
  const error = new Error(message);
  error.statusCode = 401;
  return error;
}

function validateUsername(username) {
  if (typeof username !== "string") {
    throw createInputError("username must be a string");
  }

  const trimmed = username.trim().toLowerCase();

  if (trimmed.length < MIN_USERNAME_LENGTH || trimmed.length > MAX_USERNAME_LENGTH) {
    throw createInputError(
      `username must be between ${MIN_USERNAME_LENGTH} and ${MAX_USERNAME_LENGTH} characters`,
    );
  }

  if (!/^[a-z0-9._-]+$/.test(trimmed)) {
    throw createInputError(
      "username may only contain lowercase letters, numbers, dots, underscores, and hyphens",
    );
  }

  return trimmed;
}

function validatePassword(password) {
  if (typeof password !== "string") {
    throw createInputError("password must be a string");
  }

  if (password.length < MIN_PASSWORD_LENGTH || password.length > MAX_PASSWORD_LENGTH) {
    throw createInputError(
      `password must be between ${MIN_PASSWORD_LENGTH} and ${MAX_PASSWORD_LENGTH} characters`,
    );
  }

  return password;
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const derivedKey = crypto.scryptSync(password, salt, SCRYPT_KEYLEN);
  return `${salt.toString("hex")}:${derivedKey.toString("hex")}`;
}

function verifyPassword(password, storedHash) {
  const [saltHex, keyHex] = (storedHash || "").split(":");

  if (!saltHex || !keyHex) {
    return false;
  }

  const salt = Buffer.from(saltHex, "hex");
  const expectedKey = Buffer.from(keyHex, "hex");
  const derivedKey = crypto.scryptSync(password, salt, SCRYPT_KEYLEN);

  return (
    derivedKey.length === expectedKey.length &&
    crypto.timingSafeEqual(derivedKey, expectedKey)
  );
}

function issueToken(username) {
  return jwt.sign({ sub: username }, getJwtSecret(), {
    algorithm: "HS256",
    expiresIn: getJwtExpirySeconds(),
  });
}

async function signUp(input = {}) {
  const username = validateUsername(input.username);
  const password = validatePassword(input.password);
  const passwordHash = hashPassword(password);

  try {
    await getDynamoClient().send(
      new PutCommand({
        TableName: getUsersTableName(),
        Item: {
          username,
          passwordHash,
          createdAt: new Date().toISOString(),
        },
        ConditionExpression: "attribute_not_exists(username)",
      }),
    );
  } catch (error) {
    if (error.name === "ConditionalCheckFailedException") {
      throw createInputError("username is already taken");
    }
    throw error;
  }

  return { token: issueToken(username), username };
}

async function login(input = {}) {
  const username = validateUsername(input.username);
  const password = validatePassword(input.password);

  const result = await getDynamoClient().send(
    new GetCommand({
      TableName: getUsersTableName(),
      Key: { username },
    }),
  );

  const storedHash = result.Item ? result.Item.passwordHash : DUMMY_PASSWORD_HASH;
  const passwordMatches = verifyPassword(password, storedHash);

  if (!result.Item || !passwordMatches) {
    throw createAuthError("Invalid username or password");
  }

  return { token: issueToken(username), username };
}

module.exports = {
  signUp,
  login,
};
