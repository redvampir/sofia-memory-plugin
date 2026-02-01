const Ajv = require('ajv');

const rootIndexSchema = {
  type: 'object',
  required: ['type', 'branches'],
  properties: {
    type: { const: 'index-root' },
    branches: {
      type: 'array',
      items: {
        type: 'object',
        required: ['category', 'path'],
        properties: {
          category: { type: 'string' },
          path: { type: 'string' }
        },
        additionalProperties: false
      }
    }
  },
  additionalProperties: false
};

const branchIndexSchema = {
  type: 'object',
  required: ['type', 'category', 'files'],
  properties: {
    type: { const: 'index-branch' },
    category: { type: 'string' },
    files: {
      type: 'array',
      items: {
        type: 'object',
        required: ['title', 'file'],
        properties: {
          title: { type: 'string' },
          file: { type: 'string' }
        },
        additionalProperties: true
      }
    }
  },
  additionalProperties: false
};

const ajv = new Ajv({ allErrors: true });
// Support schemas that use the non-standard "uint32" format.
// Ajv does not provide this format out of the box, so we add a validator
// that checks for unsigned 32-bit integers.
ajv.addFormat('uint32', {
  type: 'number',
  validate: (num) => Number.isInteger(num) && num >= 0 && num <= 0xFFFFFFFF,
});
const validateRootIndex = ajv.compile(rootIndexSchema);
const validateBranchIndex = ajv.compile(branchIndexSchema);

module.exports = {
  rootIndexSchema,
  branchIndexSchema,
  validateRootIndex,
  validateBranchIndex
};
