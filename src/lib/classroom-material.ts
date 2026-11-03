/** Published Admin → Materials item made available to a live classroom. */
export type ClassroomMaterial = {
  id: number;
  title: string;
  kind: string;
  category: string;
  language: string;
  level: string;
  fileUrl: string;
  coverUrl: string;
  description: string | null;
};
