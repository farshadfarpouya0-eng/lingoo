export type IdStatus = "verified" | "pending" | "rejected" | "none";
export type TRow = {
  id: number; name: string; email: string; avatar: string; nativeLang: string; suspended: boolean;
  active: boolean; certified: boolean; rating: number; reviewsCount: number; lessonsCount: number; price: number;
  startHour: number; endHour: number; tzOffset: number; workDays: string;
  headline: string; bio: string; country: string; accent: string; speaks: string; tags: string;
  payoutMethod: string; payoutAccount: string; balance: number; idStatus: IdStatus;
};
