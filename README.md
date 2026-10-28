# Imperia BAS

Веб‑приложение учебного контура БАС: отделы, график, переработки, срез знаний, контроль работы, чат, ТМЦ, полигон.

## Стек

- Vite 8
- React 19
- TypeScript
- Tailwind CSS 4

## Быстрый старт

```bash
cp .env.example .env
npm install
npm run dev
```

Приложение слушает порт `4521` на всех интерфейсах. Предпочтительный LAN‑IP задаётся в `.env` (`FC_LAN_IP`).

```bash
npm run build
npm run preview
```

```bash
npm run lint
```

## Структура

```
src/
  components/   # UI разделов
  hooks/        # состояние приложения
  lib/          # доменная логика, хранилище, правила
  App.tsx
  main.tsx
  types.ts
public/         # статика и шаблоны ТМЦ
scripts/        # вспомогательные скрипты
```

Данные клиента хранятся локально (`localStorage` + IndexedDB). Секреты не коммитятся: используйте `.env` на основе `.env.example`.

## Лицензия

Private.
