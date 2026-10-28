/** Логин как у Малюго: фамилиястрочными + инициалы ЗАГЛАВНЫМИ → малюгоДН */
export function loginFromFio(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return 'сотрудник'
  const surname = parts[0].toLocaleLowerCase('ru-RU')
  const initials = parts
    .slice(1)
    .map((p) => p.charAt(0).toLocaleUpperCase('ru-RU'))
    .join('')
  return `${surname}${initials}`
}

/** Кузьмин И.И. */
export function shortInitials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return ''
  const surname = parts[0]
  const initials = parts
    .slice(1)
    .map((p) => `${p.charAt(0).toLocaleUpperCase('ru-RU')}.`)
    .join('')
  return initials ? `${surname} ${initials}` : surname
}

export function roleTitleRu(
  role: 'senior_instructor' | 'instructor' | 'assistant',
): string {
  if (role === 'senior_instructor') return 'Старший инструктор'
  if (role === 'assistant') return 'Ассистент инструктора'
  return 'Инструктор'
}
