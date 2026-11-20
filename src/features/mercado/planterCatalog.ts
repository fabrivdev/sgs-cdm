const modelOptions: Readonly<Record<string, readonly number[]>> = {
  "HORSCH:DAKAR8CF": [30, 34, 46],
  "HORSCH:DAKAR10CF": [40, 44, 60],
  "BALDAN:PPS4500": [5, 12],
  "BALDAN:SPE4000": [4, 9],
  "BALDAN:SPTG7500": [15, 17],
  "BALDAN:SPTOPOGRAFIC7500": [15, 17],
  "BALDAN:SKADI5000SB": [25],
  "BALDAN:SKADI5000": [25],
  "SEMEATO:SSM41": [13, 41],
};

export function catalogLineOptions(brand: string, model: string): readonly number[] | undefined {
  const key = model.replace(/[^A-Z0-9]/g, "");
  const options = modelOptions[brand + ":" + key];
  if (options) return options;
  if (brand === "MASSEY FERGUSON") {
    const mf = key.match(/^(?:ABONADORA)?MF(50[89]|51[0-357])(?:X[HMP]?)?$/);
    if (mf) {
      const maximum = Number(mf[1]) - 500;
      return [maximum - (maximum === 15 || maximum === 17 ? 2 : 1), maximum];
    }
  }
  if (brand === "FRAVI" || brand === "PLANTI CENTER") {
    const premier = model.match(/^(?:TERRACUS\s+)?PREMIER\s+(\d{1,2})\s*\/\s*(\d{1,2})$/);
    if (premier) return [Number(premier[1]), Number(premier[2])];
  }
}
