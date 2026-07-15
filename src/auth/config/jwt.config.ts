import { registerAs } from '@nestjs/config';

export default registerAs('jwt', () => {
  return {
    secret: process.env.JWT_SECRET,
    audience: process.env.JWT_TOKEN_AUDIENCE,
    issuer: process.env.JWT_TOKEN_ISSUER,
    // `||` (não `??`): Number(undefined) é NaN, que não é nullish e passaria
    // pelo `??`, deixando expiresIn = NaN.
    jwtTtl: Number(process.env.JWT_TTL) || 1200,
    jwtRefreshTtl: Number(process.env.JWT_REFRESH_TOKEN_TTL) || 86400,
  };
});
