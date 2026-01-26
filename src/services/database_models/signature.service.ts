// signature.service.ts
import { Prisma } from "@backend/db/index.ts";

export abstract class SignatureService {
  /**
   * Create a new signature for a user
   */
  static async create(data: {
    userId: string;
    imageUrl: string;
    isDefault?: boolean;
  }) {
    // If this is the default signature, unset any existing defaults
    if (data.isDefault) {
      await Prisma.signature.updateMany({
        where: { userId: data.userId, isDefault: true },
        data: { isDefault: false },
      });
    }

    return Prisma.signature.create({
      data: {
        userId: data.userId,
        imageUrl: data.imageUrl,
        isDefault: data.isDefault ?? false,
      },
    });
  }

  /**
   * Get all signatures for a user
   */
  static async getByUser(userId: string) {
    return Prisma.signature.findMany({
      where: { userId },
      orderBy: [
        { isDefault: "desc" },
        { createdAt: "desc" },
      ],
    });
  }

  /**
   * Get user's default signature
   */
  static async getDefaultSignature(userId: string) {
    return Prisma.signature.findFirst({
      where: { userId, isDefault: true },
    });
  }

  /**
   * Get signature by ID
   */
  static async getById(id: string) {
    return Prisma.signature.findUnique({
      where: { id },
    });
  }

  /**
   * Set signature as default
   */
  static async setDefault(id: string, userId: string) {
    // Unset existing defaults
    await Prisma.signature.updateMany({
      where: { userId, isDefault: true },
      data: { isDefault: false },
    });

    // Set new default
    return Prisma.signature.update({
      where: { id },
      data: { isDefault: true },
    });
  }

  /**
   * Delete a signature
   */
  static async delete(id: string) {
    return Prisma.signature.delete({
      where: { id },
    });
  }

  /**
   * Get or create default signature for user
   * Returns the default signature URL if exists
   */
  static async getDefaultSignatureUrl(userId: string): Promise<string | null> {
    const signature = await this.getDefaultSignature(userId);
    return signature?.imageUrl ?? null;
  }
}
