export type Investor = {
  id: number;
  name: string;
  body: number;
  accrued: number;
  paid: number;
  due: number;
  rate: number;
  status: string;
  entryDate?: string;
  activationDate?: string;
  owner: { id: number; username: string; role: string };
  investorUser?: { id: number; username: string } | null;
  isPrivate?: boolean;
  linkedUserId?: number | null;
  investorUserId?: number | null;
};
