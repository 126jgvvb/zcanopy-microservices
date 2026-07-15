import { protoSchema } from './proto-schema.js';

describe('protoSchema', () => {
  it('should work', () => {
    expect(protoSchema()).toEqual('proto-schema');
  });
});
