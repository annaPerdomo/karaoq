# Task 06 — quota-error copy

Read `README.md` first. Depends on: nothing (independent). Ships with the phase-1 deploy.

## Objective

When search is quota-dead, tell singers the two things that still work: song ideas
(largely corpus-served) and pasting a link. One new i18n key, one component edit.

## Component edit

`components/search/SearchResults.tsx`, inside the quota branch (where
`search.unavailable.quotaBody` renders): add a paragraph ABOVE the existing
`search.quotaPasteHint` one, shown under the same condition as the paste hint
(`(searchError.quota || …) && searchError.source !== 'lookup'`):

```tsx
<p className={styles.unavailableBody}>{t('search.quotaIdeasHint')}</p>
```

No new CSS. Do not change the existing keys' wording.

## The key — exact strings for all 10 catalogs

Add `search.quotaIdeasHint` to `lib/i18n/en.json` AND every file in `public/i18n/`
(cs, de, es, fil, fr, id, ja, ko, pt), placed adjacent to `search.quotaPasteHint`. The
parity test (`tests/lib/i18n.test.ts`) fails if any catalog misses it. Each string reuses
that locale's established name for the "Song ideas" section — do not re-translate those.

| file | value |
|---|---|
| en.json | `Good news — the song ideas usually still work: many popular songs are ready to sing without a search.` |
| cs.json | `Dobrá zpráva — nápady na písničky většinou fungují dál: spousta oblíbených písniček je připravená ke zpěvu i bez vyhledávání.` |
| de.json | `Die gute Nachricht: Die Song-Ideen funktionieren meist weiterhin – viele beliebte Songs sind auch ohne Suche startklar.` |
| es.json | `Buenas noticias: las ideas de canciones suelen seguir funcionando; muchas canciones populares están listas para cantar sin necesidad de buscar.` |
| fil.json | `Good news — kadalasang gumagana pa rin ang mga song ideas: maraming sikat na kanta ang handa nang kantahin kahit walang search.` |
| fr.json | `Bonne nouvelle : les idées de chansons fonctionnent la plupart du temps — beaucoup de chansons populaires sont prêtes à chanter sans recherche.` |
| id.json | `Kabar baik — ide lagu biasanya tetap berfungsi: banyak lagu populer siap dinyanyikan tanpa perlu mencari.` |
| ja.json | `朗報：曲のアイデアはほとんどの場合そのまま使えます。人気曲の多くは検索なしで歌う準備ができています。` |
| ko.json | `좋은 소식 — 노래 아이디어는 대부분 계속 사용할 수 있어요. 인기곡 다수는 검색 없이 바로 부를 준비가 되어 있답니다.` |
| pt.json | `Boa notícia: as ideias de música normalmente continuam funcionando — muitas músicas populares estão prontas para cantar sem precisar pesquisar.` |

JSON edits: keep key ordering (insert next to the anchor key), `ensure_ascii` off /
UTF-8 preserved, trailing newline preserved.

## Tests

`pnpm exec vitest run tests/lib/i18n.test.ts` green is the main gate. Add one assertion to
the existing SearchResults quota-state test (if present) that the new hint renders alongside
the paste hint.

## Acceptance

tsc clean; full suite green; `git diff` on the 10 JSON files shows exactly one added line
each.
