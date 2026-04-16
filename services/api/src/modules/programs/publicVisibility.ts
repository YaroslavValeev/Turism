type PublicProgramVisibilityShape = {
  publishStatus: string;
  endDate: Date;
  spotsAvailable: number | null;
};

export function getProgramVisibilityThresholdDate(): Date {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

export function isProgramPubliclyVisible(program: PublicProgramVisibilityShape): boolean {
  return (
    program.publishStatus === "published"
    && program.endDate >= getProgramVisibilityThresholdDate()
    && (program.spotsAvailable == null || program.spotsAvailable > 0)
  );
}
