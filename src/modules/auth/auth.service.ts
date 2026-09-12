import { prisma } from '../../database/prisma.js';
import { hashPassword, comparePassword } from '../../common/security/hash.js';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  TokenPayload,
} from '../../common/security/jwt.js';
import {
  ConflictError,
  UnauthorizedError,
  NotFoundError,
  BadRequestError,
} from '../../common/errors/AppError.js';
import { RegisterInput, LoginInput, UpdateProfileInput } from './auth.dto.js';
import { AuditService } from '../audit/audit.service.js';
import { Role, CompanyType } from '@prisma/client';

export class AuthService {
  public static async register(input: RegisterInput) {
    // Role & Company consistency validation
    if (input.role === Role.SELLER && input.company.companyType !== CompanyType.EMITTER) {
      throw new BadRequestError('Seller accounts must register as an EMITTER company.');
    }
    if (input.role === Role.BUYER && input.company.companyType !== CompanyType.OFFTAKER) {
      throw new BadRequestError('Buyer accounts must register as an OFFTAKER company.');
    }

    // Check existing email
    const existingUser = await prisma.user.findUnique({
      where: { email: input.email.toLowerCase() },
    });

    if (existingUser) {
      throw new ConflictError('A user with this email address already exists.');
    }

    // Check existing company
    const existingCompany = await prisma.company.findUnique({
      where: { registrationNumber: input.company.registrationNumber },
    });

    if (existingCompany) {
      throw new ConflictError('A company with this registration number already exists.');
    }

    const passwordHash = await hashPassword(input.password);

    // Create Company and User atomically
    const result = await prisma.$transaction(async (tx) => {
      const company = await tx.company.create({
        data: {
          name: input.company.name,
          companyType: input.company.companyType,
          registrationNumber: input.company.registrationNumber,
          latitude: input.company.latitude,
          longitude: input.company.longitude,
          address: input.company.address,
        },
      });

      const user = await tx.user.create({
        data: {
          email: input.email.toLowerCase(),
          passwordHash,
          fullName: input.fullName,
          role: input.role,
          companyId: company.id,
        },
        select: {
          id: true,
          email: true,
          fullName: true,
          role: true,
          companyId: true,
          createdAt: true,
        },
      });

      await AuditService.recordEvent(
        {
          entityType: 'USER',
          entityId: user.id,
          action: 'USER_REGISTERED',
          actorId: user.id,
          metadata: { email: user.email, role: user.role, companyId: company.id },
        },
        tx
      );

      return { user, company };
    });

    const tokenPayload: TokenPayload = {
      userId: result.user.id,
      email: result.user.email,
      role: result.user.role,
      companyId: result.user.companyId,
    };

    const accessToken = signAccessToken(tokenPayload);
    const refreshToken = signRefreshToken(tokenPayload);

    return {
      user: result.user,
      company: result.company,
      tokens: {
        accessToken,
        refreshToken,
      },
    };
  }

  public static async login(input: LoginInput) {
    const user = await prisma.user.findUnique({
      where: { email: input.email.toLowerCase() },
      include: { company: true },
    });

    if (!user) {
      throw new UnauthorizedError('Invalid email or password.');
    }

    const isValid = await comparePassword(input.password, user.passwordHash);

    if (!isValid) {
      throw new UnauthorizedError('Invalid email or password.');
    }

    const tokenPayload: TokenPayload = {
      userId: user.id,
      email: user.email,
      role: user.role,
      companyId: user.companyId,
    };

    const accessToken = signAccessToken(tokenPayload);
    const refreshToken = signRefreshToken(tokenPayload);

    await AuditService.recordEvent({
      entityType: 'USER',
      entityId: user.id,
      action: 'USER_LOGGED_IN',
      actorId: user.id,
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        companyId: user.companyId,
        createdAt: user.createdAt,
      },
      company: user.company,
      tokens: {
        accessToken,
        refreshToken,
      },
    };
  }

  public static async refreshToken(token: string) {
    let payload: TokenPayload;
    try {
      payload = verifyRefreshToken(token);
    } catch {
      throw new UnauthorizedError('Invalid or expired refresh token.');
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
    });

    if (!user) {
      throw new UnauthorizedError('User account not found.');
    }

    const newPayload: TokenPayload = {
      userId: user.id,
      email: user.email,
      role: user.role,
      companyId: user.companyId,
    };

    return {
      accessToken: signAccessToken(newPayload),
      refreshToken: signRefreshToken(newPayload),
    };
  }

  public static async getMe(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        createdAt: true,
        company: true,
      },
    });

    if (!user) {
      throw new NotFoundError('User profile not found.');
    }

    return user;
  }

  public static async updateMe(userId: string, input: UpdateProfileInput) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { company: true },
    });

    if (!user) {
      throw new NotFoundError('User profile not found.');
    }

    if (input.fullName !== undefined) {
      const trimmedName = input.fullName.trim();
      await prisma.user.update({
        where: { id: userId },
        data: { fullName: trimmedName },
      });
    }

    const companyUpdates: { name?: string; address?: string } = {};
    if (input.companyName !== undefined) {
      companyUpdates.name = input.companyName.trim();
    }
    if (input.companyLocation !== undefined) {
      companyUpdates.address = input.companyLocation.trim();
    }

    if (Object.keys(companyUpdates).length > 0 && user.companyId) {
      await prisma.company.update({
        where: { id: user.companyId },
        data: companyUpdates,
      });
    }

    await AuditService.recordEvent({
      entityType: 'USER',
      entityId: user.id,
      action: 'USER_PROFILE_UPDATED',
      actorId: user.id,
      metadata: {
        updatedFields: Object.keys(input),
      },
    });

    const updated = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        createdAt: true,
        company: true,
      },
    });

    return updated;
  }
}
