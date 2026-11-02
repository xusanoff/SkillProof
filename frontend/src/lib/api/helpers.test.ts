import { describe, expect, it } from 'vitest';
import { ApiError } from './errors';
import { apiAssetUrl, fieldErrors } from './helpers';

describe('fieldErrors', () => {
  it('maps validation details to the last string segment of loc', () => {
    const err = new ApiError(422, 'validation_error', 'x', {
      fields: [
        { loc: ['body', 'email'], msg: 'bad', type: 'value_error' },
        { loc: ['body', 'password'], msg: 'short', type: 'string_too_short' },
        { loc: ['body'], msg: 'x', type: 'missing' },
      ],
    });
    expect(fieldErrors(err)).toEqual({ email: 'value_error', password: 'string_too_short' });
  });

  it('ignores other errors', () => {
    expect(fieldErrors(new ApiError(401, 'invalid_credentials', 'x'))).toEqual({});
    expect(fieldErrors(new Error('x'))).toEqual({});
  });
});

describe('apiAssetUrl', () => {
  it('prefixes API paths with the proxy base', () => {
    expect(apiAssetUrl('/api/v1/companies/1/logo?v=2')).toBe('/api/api/v1/companies/1/logo?v=2');
    expect(apiAssetUrl('https://cdn.example/x.png')).toBe('https://cdn.example/x.png');
    expect(apiAssetUrl(null)).toBeNull();
  });
});
