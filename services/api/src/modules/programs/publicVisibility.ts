type PublicProgramVisibilityShape = {
  publishStatus: string;
};

export function isProgramPubliclyVisible(program: PublicProgramVisibilityShape): boolean {
  return program.publishStatus === "published";
}
