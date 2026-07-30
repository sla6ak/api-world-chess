declare namespace Express {
  interface Request {
    user?: {
      _id: string;
      email: string;
      name?: string;
      currentReiting?: number;
      token?: string;
      requireVerificationEmail?: boolean;
      verify?: boolean;
    };
    color?: string;
    gameId?: string;
  }
}
