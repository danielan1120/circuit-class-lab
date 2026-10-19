export const CLASS_NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8] as const;
export type ClassNumber = typeof CLASS_NUMBERS[number];

export function parseClassNumber(value: string | null): ClassNumber {
  return value !== null && /^[1-8]$/.test(value) ? Number(value) as ClassNumber : 1;
}

function checkedClassNumber(value: number): ClassNumber {
  if (!Number.isInteger(value) || value < 1 || value > 8) {
    throw new RangeError("2학년 1반부터 8반까지 선택할 수 있어요.");
  }
  return value as ClassNumber;
}

function checkedBaseRoom(baseRoom: string): string {
  if (!/^[a-zA-Z0-9_-]{1,48}$/.test(baseRoom)) {
    throw new RangeError("수업 코드는 영문, 숫자, 밑줄, 붙임표로 1~48자까지 입력해 주세요.");
  }
  return baseRoom;
}

export function getClassLabel(classNumber: number): string {
  return `2학년 ${checkedClassNumber(classNumber)}반`;
}

export function getClassRoom(baseRoom: string, classNumber: number): string {
  const room = checkedBaseRoom(baseRoom);
  const number = checkedClassNumber(classNumber);
  // Class 1 keeps every existing link and graph in its original namespace.
  // The longest derived room is 54 characters; the API accepts up to 64.
  return number === 1 ? room : `${room}--g2c${number}`;
}

export function getClassBoardPath(baseRoom: string, classNumber: number): string {
  const room = checkedBaseRoom(baseRoom);
  const number = checkedClassNumber(classNumber);
  return `?room=${encodeURIComponent(room)}&class=${number}`;
}
