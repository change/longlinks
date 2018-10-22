module.exports = {
  extends: ['change-base', 'plugin:jest/recommended', 'plugin:security/recommended'],

  plugins: ['jest', 'security'],

  env: {
    'jest/globals': true,
  },
};
