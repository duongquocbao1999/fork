# forks — настройка X, Supabase, Netlify, монет и терминала

Без этой настройки сайт уже работает: архив, модель (если есть `FORKS_LLM_KEY`) и `/freeforks` в демо-режиме вне forks.wiki. Ниже — как включить настоящий вход через X и задания с записью в базу.

## 0. Что нужно заполнить

| Где | Что | Пример |
|---|---|---|
| `src/config.js` → `x.handle` | X-аккаунт для задания follow, без `@` | `forkwikis` |
| `src/config.js` → `x.post` | ID поста для like / retweet / comment / quote (число из `x.com/<автор>/status/<ID>`) | `20` |
| `src/config.js` → `x.postBy` | автор этого поста, без `@` (для ссылки на коммент) | `jack` |
| `src/config.js` → `links.x` | ссылка на X в шапке | `https://x.com/forkwikis` |
| `src/config.js` → `token.ca` | Solana CA, когда появится; пусто = «launching soon» | |
| Netlify env | переменные из таблицы в разделе 3 | |

Сейчас там тестовый пост `x.com/jack/status/20` (первый пост в Twitter): на нём можно проверить, как открываются ссылки и засчитываются задания. Для запуска поставь свой пост в `x.post` и `x.postBy`.

Пока `x.handle` и `x.post` пустые, upstream отвечает на `/freeforks` «the trials open soon», а `/api/health` показывает их в `config`.

## 0.5. GitHub-токен (без него деревья не строятся)

Каждая точка графа — настоящий репозиторий, и сервер проверяет их через GitHub API.

1. github.com → Settings → Developer settings → Personal access tokens → **Fine-grained tokens** → Generate new token.
2. Repository access: **Public repositories (read-only)**. Никаких других прав не нужно.
3. Значение → `GITHUB_TOKEN` в Netlify (Scope: Functions, «Contains secret values»).
4. Лимиты с токеном: 5 000 запросов в час на проверку репо (один запрос на дерево) и 30 поисков в минуту; ответы кэшируются на сутки.

## 1. X Developer Portal (вход через X)

1. developer.x.com → Projects & Apps → создать App внутри Project (без Project X API v2 не отдаст профиль).
2. **User authentication settings:**
   - App permissions: **Read**;
   - Type of App: **Web App, Automated App or Bot** (confidential client, появится Client Secret);
   - Callback URI / Redirect URL: `https://forks.wiki/auth/x/callback`. Для локального теста добавь `http://127.0.0.1:5173/auth/x/callback` (X не принимает `localhost`);
   - Website URL: `https://forks.wiki`.
3. Keys and tokens → **OAuth 2.0 Client ID и Client Secret** → `X_CLIENT_ID`, `X_CLIENT_SECRET`. Не путать с API Key / Secret от OAuth 1.0a.

Скоупы `users.read tweet.read`. Колбэк читает `users/me` с полями `created_at, public_metrics, verified, verified_type` — из них X-скан. Токен X сразу отзывается после чтения профиля, мы его не храним. Задания с X не сверяются: сервер засчитывает их через 5 секунд после открытия ссылки.

## 2. Supabase

1. Создать проект (регион us-east ближе к функциям Netlify).
2. SQL Editor → по очереди, каждый файл в новом запросе → Run:
   - `supabase/migrations/0001_init.sql`;
   - `supabase/migrations/0002_scan.sql` — X-скан;
   - `supabase/migrations/0003_refs.sql` — шесть заданий, квоут, рефералка;
   - `supabase/migrations/0004_launch.sql` — монеты на репозиториях (раздел 5.7);
   - `supabase/migrations/0005_github.sql` — необязательное задание «подключи GitHub» (раздел 5.9).

   Все можно запускать повторно, суммы и версия схемы при этом не сбрасываются; порядок важен. Если база уже на 4.0 (schema 4) — достаточно `0005_github.sql`. Чего не хватает, показывает `migrations` в `/api/health`; пока миграция не запущена, вход работает по старой схеме.
3. Advisors → Security: не должно быть «RLS disabled».
4. Project Settings → API (или API Keys):
   - `SUPABASE_URL` = Project URL;
   - `SUPABASE_SERVICE_ROLE_KEY` = service_role или secret key (`sb_secret_…`). **Только сервер.**
5. Бесплатный проект засыпает после недели без запросов: Restore в дашборде.

## 3. Netlify

1. Как заливать. **Не перетаскивай zip в Netlify**: так загрузится только страница, без функций, и деревья не построятся (`/api/trace` будет 404). Два рабочих способа:
   - **Netlify CLI с компьютера** (нужен Node 20+). Из распакованной папки проекта:
     ```bash
     npm install                    # с 3.5: библиотеки pump.fun и Solana для функций launch и market
     npx netlify-cli login          # один раз
     npx netlify-cli link           # один раз: выбрать сайт forks.wiki
     npx netlify-cli deploy --prod  # каждый раз, когда заливаешь новую версию
     ```
     Без `npm install` функции `launch` и `market` не соберутся (CLI берёт библиотеки из локальной `node_modules`).
   - **Из GitHub**: Netlify → Site configuration → Build & deploy → Link repository → `forkwiki/fork`. Тогда каждый пуш в репозиторий сам обновляет сайт, а `npm install` Netlify делает сам.
2. Site configuration → Environment variables (Scope: Functions, «Contains secret values»):

| Переменная | Значение | Обязательно |
|---|---|---|
| `X_CLIENT_ID`, `X_CLIENT_SECRET` | из X Portal | да |
| `SESSION_SECRET` | `openssl rand -base64 48` (32+ символов) | да |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | из Supabase | да |
| `SITE_URL` | `https://forks.wiki` | да, на своём домене |
| `X_MIN_ACCOUNT_AGE_DAYS` | например `30` | нет (по умолчанию проверки нет) |
| `GITHUB_TOKEN` | fine-grained, public repositories read-only | да, для деревьев |
| `FORKS_LLM_KEY` | ключ DeepSeek (platform.deepseek.com → API keys) | да, для деревьев |
| `FORKS_LLM_URL`, `FORKS_LLM_MODEL` | endpoint и модель | нет (`https://api.deepseek.com/chat/completions`, `deepseek-flash`) |
| `FORKS_TRACES_PER_MIN` | новых деревьев с одного IP в минуту | нет (8) |
| `SOLANA_RPC_URL` | mainnet RPC с ключом, например `https://mainnet.helius-rpc.com/?api-key=…` | да, для монет (5.7) |
| `JITO_URL` | block engine Jito, например `https://ny.mainnet.block-engine.jito.wtf` | нет (`https://mainnet.block-engine.jito.wtf`) |
| `PINATA_JWT` | JWT ключа Pinata (Files: Write) — лого и метаданные монет в IPFS (5.7, шаг 0) | да, для монет |
| `PINATA_GATEWAY` | свой шлюз Pinata (`имя.mypinata.cloud`) — его `/api/ipfs/<cid>` спрашивает первым, когда показывает лого | нет (публичные шлюзы) |
| `PUMP_IPFS_URL` | другой загрузчик со старой формой pump.fun, только если нет `PINATA_JWT` | нет |
| `LAUNCH_BUILDS_PER_MIN` | сборок запуска с одного IP в минуту | нет (6) |
| `JUP_API_KEY` | бесплатный ключ Jupiter (developers.jup.ag/portal) — для сделок через Jupiter | рекомендуется: без ключа 0,5 запроса в секунду на весь сайт |
| `JUP_URL` | адрес Swap API | нет (`https://api.jup.ag/swap/v2`) |
| `JUP_REFERRAL_ACCOUNT` | адрес реферального аккаунта forks в Jupiter (5.10) — 0,5% со сделок через Jupiter. Не секрет | нет: без него сделки через Jupiter идут без комиссии forks |

3. **После изменения env заново задеплой** (`npx netlify-cli deploy --prod` или Deploys → Trigger deploy). Без этого функции не видят новые значения.
4. Открыть `https://forks.wiki/api/health`. Ждём `"ok": true`; `missing` и `config` пустые, `db.ok: true`, `db.schema: "4"`, `github: true`, `model: true`; для монет — `launch.ready: true`; для комиссии — `trade.fee_bps: 50` и (после 5.10) `trade.jupiter_fee: true`. Поле `callback_url` скопировать в X Portal символ в символ.
5. DeepSeek работает по предоплате: сколько положил на баланс, больше не потратится. Один новый вопрос — около 700 токенов на вход (большая часть — одинаковый промпт, он идёт по цене кэша) и около 250 на выход; повторный вопрос модель не трогает (кэш на неделю). В логах функции `trace` видно токены каждого вызова.
6. Пройти вход целиком с телефона, в том числе из браузера внутри X: кнопка **get +10,000 $FORK** → sign in with x → X → назад → анимация X-скана → follow, like, retweet, comment → вопрос в чат → карточка: copy card → quote on x → вставить ссылку на свой квоут → кошелёк. Потом открыть `forks.wiki/r/<твой хендл>` в другом браузере и войти другим аккаунтом.

## 4. Локально

```bash
npm start                                   # http://127.0.0.1:5173, /freeforks в демо-режиме
X_CLIENT_ID=… X_CLIENT_SECRET=… SESSION_SECRET=… \
SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… npm start   # настоящий вход и база
```

Открывать именно `http://127.0.0.1:5173`, не `localhost`: так совпадает callback. ⚠️ С боевыми ключами локальный сервер пишет в **боевую** базу; для тестов заведи отдельный проект Supabase.

## 5. Ошибка → причина

| Что видно | Причина |
|---|---|
| Тост «X refused the sign-in» (`reason=token`) | Callback в X Portal не совпадает символ в символ, неверный секрет или тип приложения не Web App |
| «Sign-in took too long» / «check failed» (`expired`, `state`) | Заблокированы куки, вход дольше 10 минут, начали на www, а вернулись без www (поставь `SITE_URL`) |
| «Could not read your X profile» (`profile`) | App не привязан к Project, нет доступа к X API v2 |
| «Could not save your account» (`database`) | `0001_init.sql` не запущена, неверный service key, проект Supabase на паузе |
| Квоут: «another account» | Вставлена ссылка на чужой пост; нужна ссылка вида `x.com/<свой хендл>/status/…` |
| Квоут: «older than your fork» | Пост сделан раньше, чем человек впервые вошёл на forks; нужен новый квоут |
| Квоут: «already been counted» | Этот пост уже засчитан (себе или другому аккаунту) |
| Не начисляется за друга | Друг не новый (уже входил раньше), зашёл не по ссылке, ещё не сделал 3 задания, или сработал `ref.min_followers` |
| Нет анимации X-скана после входа | Не запущена `0002_scan.sql` (смотри `migrations` в `/api/health`) или аккаунт уже сканировался |
| «Sign-in is not set up» (`setup`) | Не заданы env в Netlify или не было редеплоя |
| «too new» (`too_new`) | Аккаунт моложе `X_MIN_ACCOUNT_AGE_DAYS` |
| upstream: «the trials open soon» | Пустые `x.handle` / `x.post` в `src/config.js` |
| upstream: «the ledger isn't answering» | `/api/me` на forks.wiki отдаёт не JSON: функции не задеплоились или упали; смотри `/api/health` и логи функций |
| `/api/*` отдаёт HTML или 404 | Деплой без функций (drag-and-drop) |
| upstream: «couldn’t reach a model or github» | Нет `FORKS_LLM_KEY` и `GITHUB_TOKEN`, или не было редеплоя |
| upstream: «this is github alone» | Нет `FORKS_LLM_KEY` (или модель недоступна): дерево только из данных GitHub |
| Задание «give it a few more seconds» | Нажали раньше 5 с — сервер считает по своим часам, повтор засчитает |
| `/launch`: карточка с бейджем PREVIEW, кнопка «launches open soon» | Пустой `launch.treasury` в `src/config.js`, нет `SOLANA_RPC_URL`, не запущена `0004_launch.sql` (смотри `launch.missing` и `migrations` в `/api/health`) или не было редеплоя |
| `/launch`: «couldn't build it just now» | Функция `launch` не собралась (деплой без `npm install`) или RPC не отвечает; смотри логи функции `launch` |
| «IPFS didn’t take the logo just now» / раньше «pump.fun’s IPFS didn’t answer» | pump.fun больше не принимает загрузки на `pump.fun/api/ipfs` (с осени 2026). С 4.1.1 лого и метаданные идут в IPFS через Pinata: нужен `PINATA_JWT` (раздел 5.7). Если ключ есть — Pinata не ответил, повторить |
| «The logo can’t be stored on IPFS: the site’s Pinata key is missing or wrong» | Нет `PINATA_JWT`, ключ отозван или у него нет права Files: Write; после смены ключа — редеплой |
| Превью ссылки в X / Telegram старое | Платформы кэшируют превью. С 4.1.1 у каждой версии свой файл картинки (`/og/home-42.png` в 4.2), новые посты подтянут новую. Telegram: отправить ссылку боту @WebpageBot — он обновит превью; в X новые посты берут новую карточку, старые остаются как были |
| «the bundle relay is busy» | Jito ответил 429 три раза подряд (без ключа лимит ~1 запрос в секунду). Повторить или поставить `JITO_URL` региона ближе |
| «it didn’t land: the network was busy» | Бандл не попал в блок за ~1 минуту (мало чаевых, перегрузка). Бандл — всё или ничего, денег не списано; повторить. Можно поднять `launch.tipSol` в `src/config.js` |
| «your wallet changed the transactions» | Кошелёк дописал свои инструкции в транзакции; такой бандл не несёт закреплённый сплит, сервер его не отправляет. Другой кошелёк |
| «this wallet started coins on 3 repositories today» | Лимит на кошелёк в сутки (`launch.per_day` в `app_config`) |
| «a coin landed, but not with this split» | На цепи монета с другим сплитом (не через forks); в список не попадёт |
| Терминал: «Trading opens once the site is connected to Solana» | Нет `SOLANA_RPC_URL` или не было редеплоя |
| Терминал: котировка «busy, retrying…» / «The router is busy» | Jupiter отвечает 429: нет `JUP_API_KEY` (лимит 0,5 запроса в секунду на весь сайт) |
| Терминал: «no route» | Jupiter не нашёл маршрут (у токена нет ликвидности) — для монет на кривой pump.fun маршрут идёт напрямую, это не про них |
| Терминал: «The network refused it: …» | RPC отклонил транзакцию при симуляции: чаще всего проскальзывание (цена ушла) или мало SOL на комиссию |
| Терминал: нет графика / «No candles yet» | Монета на кривой: ещё не было сделок (с 4.2 график строится из сделок на цепи, нужен `SOLANA_RPC_URL`). Монета после кривой и другие токены: GeckoTerminal ещё не проиндексировал пул или упёрся в свой лимит (30 запросов в минуту) |
| Терминал: сделки свежей монеты появляются с задержкой | До 4.2 сделки брались только у GeckoTerminal (он индексирует минуты). С 4.2 у монеты на кривой — с цепи, задержка ≈5 с. Если всё равно пусто — RPC не отвечает или упёрся в лимит (Helius free: смотри дашборд) |
| Котировка: «forks fee: none» на сделке через Jupiter | Нет `JUP_REFERRAL_ACCOUNT` или не было редеплоя (`/api/health` → `trade.jupiter_fee`). Сделки на кривой берут 0,5% и без него |
| Jupiter-сделка прошла, а комиссия не пришла | У реферального аккаунта нет токен-аккаунта для монеты, в которой Jupiter взял комиссию (`feeMint`): тогда сделка идёт без комиссии. Создать токен-аккаунты SOL и USDC (5.10) |
| Лого монеты не видно (буква вместо картинки) | Картинка на IPFS ещё не разошлась по шлюзам (минуты после запуска) или ни один шлюз не ответил; `/api/ipfs/<cid>` пробует несколько. Можно задать свой `PINATA_GATEWAY` |
| У монеты на pump.fun website/telegram старые или пустые | Метаданные монеты на цепи не меняются. С 4.2 новые монеты получают website = `forks.wiki/coin/<CA>` и telegram = репозиторий на GitHub; монеты, запущенные раньше, остаются как были |
| `/coin/<адрес>`: «Couldn’t read this coin», маркет пустой, `/api/tokens` и `/api/market` отдают 502 | Функции `market` и `launch` не стартуют: Solana SDK не загрузился (до 4.0.1 — `uuid` 14 в зависимостях требует Node ≥ 20.19, а функции на Netlify шли на Node 18). Открыть `/api/chain`: `sdk.ok` должен быть `true`, там же версия Node и текст ошибки. Лечится деплоем 4.0.1 **после `npm install`** |
| `/coin/<адрес>`: «No market for this address» | У токена нет пары на DexScreener с ликвидностью от $1 000 (или это не токен). Терминал открывает монеты forks, токены проектов и любые токены Solana с живым рынком |
| Маркет: полоса Trending пустая, «Nothing trending right now» / чип top пустой | Jupiter Tokens API не ответил (без `JUP_API_KEY` лимит общий на весь сайт) и запасной GeckoTerminal тоже; списки кэшируются на 2–5 минут, повторить позже |
| Тост «GitHub sign-in is not set up on this site yet.» | Нет `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET`, не запущена `0005_github.sql` или не было редеплоя (смотри `github_connect` в `/api/health`) |
| GitHub: «The redirect_uri is not associated with this application» | В GitHub OAuth App поле Authorization callback URL не совпадает с `github_connect.callback_url` из `/api/health` символ в символ |
| Тост «That GitHub account is already connected to another X account.» | Этот GitHub уже привязан к другому X-аккаунту: один GitHub — один X, навсегда |
| Тост «This X account is already connected to another GitHub account.» | К этому X уже привязан другой GitHub; перепривязать нельзя (иначе бонус можно фармить) |
| Тост «Your GitHub account is too new for the bonus.» | GitHub-аккаунту меньше 30 дней (`github.min_age_days` в `app_config`) |
| Тост «Sign in with X first, then connect GitHub.» | Сессии X нет (или она сменилась между началом и возвратом с GitHub) |



## 5.5. X-скан

При первом входе сервер оценивает аккаунт по пяти строкам: сколько лет в X, фолловеры, посты, листы, верификация. Каждая строка насыщается сама (возраст линейно, счётчики по логарифму), у пустого аккаунта есть минимум через строку «first fork», сумма ограничена сверху. Формула — `scan_lines()` в `0002_scan.sql`. На сайте диапазон нигде не пишется: человек видит только свои строки и итог.

Начисляется один раз на аккаунт (ключ `scan:<uid>` в ledger). Повторный вход, выросший аккаунт или стёртая строка не платят второй раз.

Ручки без деплоя — таблица `app_config` (если ключа нет, берётся значение по умолчанию из SQL):

| Ключ | Что |
|---|---|
| `scan.age`, `scan.age_years` | максимум за возраст и за сколько лет он набирается |
| `scan.followers`, `scan.followers_log` | максимум за фолловеров и порядок (log10), на котором он набирается |
| `scan.posts`, `scan.posts_log` | то же для постов |
| `scan.lists`, `scan.lists_log` | то же для листов |
| `scan.verified` | за верификацию (любую: blue, business, government) |
| `scan.floor`, `scan.cap` | минимум и максимум итога |

```sql
insert into app_config (key, value) values ('scan.floor', 3000)
on conflict (key) do update set value = excluded.value;
```

Меняется только для новых сканов. Против ферм ботов — `X_MIN_ACCOUNT_AGE_DAYS` (например 30).

## 5.6. Задания, квоут и рефералка

| Задание | Сумма | Как засчитывается |
|---|---|---|
| follow | 2 000 | через 5 с после открытия ссылки (часы сервера) |
| like | 1 000 | так же |
| retweet (`repost`) | 1 500 | так же |
| comment | 1 500 | так же |
| chat — ask upstream anything | 1 000 | когда у человека выросло новое дерево после открытия задания |
| quote | 3 000 | по ссылке на квоут: хендл свой, пост новее аккаунта на forks (время из ID поста), один пост — один раз на всех |

Квоут-пост в X не проверяется через API: сайт не видит, что это именно квоут нашего поста. Это честный бесплатный уровень проверки.

Рефералка:
- ссылка `forks.wiki/r/<хендл>` (редирект в `netlify.toml`) → `?ref=` хранится в браузере 30 дней → уходит через вход в X;
- привязка один раз, только к новому аккаунту, не к себе;
- +2 000 пригласившему, когда друг сделает 3 задания.

Ручки в `app_config`: `ref.reward` (2000), `ref.min_tasks` (3), `ref.min_followers` (0 — без порога). Например, не платить за ботов без подписчиков:

```sql
insert into app_config (key, value) values ('ref.min_followers', 5)
on conflict (key) do update set value = excluded.value;
```

## 5.7. Монеты на репозиториях (pump.fun, mainnet)

Любой с Solana-кошельком запускает монету на репозиторий: `/launch owner/name`, кнопка **launch a coin** в карточке точки на дереве или чип под деревом. Одна монета на репозиторий. Монета создаётся на pump.fun из кошелька запускающего (он и платит), а **creator fees делятся один раз и навсегда**:

| Кому | Доля | Как |
|---|---|---|
| владелец репо (человек) | 70% | на его GitHub-аккаунт на pump.fun; у организации — поровну её топ-5 людям-контрибьюторам |
| топ-2 контрибьютора | 5% | GitHub |
| вверх по линии: parent / grandparent / ещё один | 10% / 3% / 2% | владелец каждого (у организации — её главный контрибьютор); сначала родитель по форку GitHub, иначе линия из дерева upstream |
| forks | 10% | на кошелёк `launch.treasury` |

Пустые доли (нет предка, нет контрибьюторов) уходят владельцу. Боты и организации не получают ничего (pump.fun не поддерживает выплаты организациям). Люди забирают свои fees на pump.fun, входя через GitHub; им ничего не нужно делать заранее. Сплит считает сервер — из GitHub и своего дерева, — клиент его не присылает.

Как это устроено на цепи: три транзакции одним Jito-бандлом (всё или ничего): (A) GitHub-аккаунты для fees, которых ещё нет; (B) `create_v2` + `create_fee_sharing_config`; (C) `update_fee_shares_v2` — финальный сплит, после неё админ отозван и сплит не меняется никогда, + чаевые Jito. Сервер не хранит кошелька: подписывает только свежий ключ mint (он едет зашифрованным в 150-секундном тикете и подписывает create уже после кошелька). Перед отправкой сервер проверяет, что каждая транзакция байт-в-байт та, что он собрал, и подпись кошелька верна. В список сайта монета попадает только после того, как сервер прочитал с цепи: кривая создана, creator = конфиг сплита, доли совпадают, админ отозван.

### Включить

0. **Pinata (лого и метаданные монеты в IPFS).** pump.fun больше не принимает загрузки через свой `/api/ipfs`; его собственная инструкция (pump-fun-skills → create-coin → METADATA.md) кладёт картинку и JSON в публичный IPFS через Pinata. Так делает и forks:
   - app.pinata.cloud → зарегистрироваться (бесплатного плана хватает: 2 файла на монету);
   - **API Keys → New Key** → права **Files: Write** (или Admin) → Create → скопировать **JWT** (длинная строка `eyJ…`, показывается один раз);
   - Netlify: `PINATA_JWT` (Functions, «Contains secret values») → редеплой;
   - проверка: `/api/health` → `launch.ipfs: "pinata"`, `launch.ready: true`.

1. **Кошелёк forks** (для 10%): создай отдельный Solana-кошелёк в Phantom, публичный адрес → `src/config.js` → `launch.treasury`. Приватный ключ никуда не нужен и на сервер не идёт.
2. **RPC**: helius.dev → бесплатный аккаунт → Mainnet RPC URL с `api-key` → `SOLANA_RPC_URL` в Netlify (секрет, только сервер).
3. **База**: SQL Editor → `supabase/migrations/0004_launch.sql` → Run.
4. **`GITHUB_TOKEN`** уже есть (раздел 0.5) — он же читает владельцев и контрибьюторов.
5. **Деплой** с `npm install` (раздел 3), затем `/api/health`: `launch.ready: true`, `launch.missing` пустой, `db.schema: "4"`.
6. **Первый запуск — тестовый и дешёвый**: на своём маленьком репозитории со своего кошелька (≈0,02–0,05 SOL на аренду аккаунтов и чаевые; точную сумму кошелёк покажет до подписи). Проверить: монета на pump.fun, в её странице видны получатели fees, `forks.wiki/?launch=<owner/name>` показывает карточку монеты. **Сплит потом не меняется — даже нами.**

⚠️ Проверено только на тестовом стенде (поддельные RPC, Jito и IPFS, настоящий pump.fun SDK 4.3.1 и настоящие подписи ed25519). Живьём не проверялось: приём загрузки на pump.fun IPFS с серверов Netlify, лимиты Jito, как Phantom/Solflare подписывают три транзакции разом (симуляция в кошельке может предупредить, что B и C «упадут» — это потому, что они зависят от предыдущих в бандле). Поэтому шаг 6 обязателен.

Ручки: `launch.split` / `orgContributors` / `contributors` / `tipSol` в `src/config.js` (только для новых монет); `launch.per_day` в `app_config` (репозиториев на кошелёк в сутки, по умолчанию 3; повтор на том же репо лимит не тратит).

Владелец просит убрать свой код — в блоклист: новые монеты на его репо запустить нельзя, уже созданные пропадают из списков forks (с цепи их убрать невозможно):

```sql
insert into launch_blocklist (pattern, reason) values ('owner', 'asked by email') on conflict do nothing;      -- весь аккаунт
insert into launch_blocklist (pattern, reason) values ('owner/name', 'asked') on conflict do nothing;         -- один репо
```

## 5.8. Маркет и терминал (4.0)

- **Маркет** `/market` (с 4.2): сверху полоса **Trending on Solana** — монета на `forkwiki/fork` закреплена первой (`config.market.pinRepo`), дальше трендовые токены Solana за час из Jupiter Tokens API (`toptrending/1h`). Ниже один общий список: монеты, запущенные через forks, токены проектов (`config.projects` в `src/config.js`, по владельцу на GitHub: `pump-fun` → PUMP и т.д.; с 4.2 их 29, с BTC и ETH на Solana) и топ токенов Solana по organic score за сутки из Jupiter (`toporganicscore/24h`, до 100: только verified или с высоким organic score, без помеченных как подозрительные, без стейблкоинов, у каждого есть лого). Чипы all · coins · projects · top, сортировки, «show more». Если Jupiter не ответил — запасной вариант, трендовые пулы GeckoTerminal. Добавить проект — новая строка `{ owner, symbol, name, mint }`, owner строчными; mint сверить на DexScreener или Solscan.
- **Любой токен**: адрес любого токена Solana с живым рынком (пара на DexScreener с ликвидностью от $1 000) открывает терминал с пометкой «Solana token · not on forks»; торговля через Jupiter.
- **Терминал** `/coin/<адрес>`: график (GeckoTerminal), сделки, держатели (наш RPC), сплит, покупка и продажа. Монета на кривой pump.fun торгуется прямо на кривой: сервер собирает транзакцию через SDK pump.fun, кошелёк подписывает, сервер сверяет байты и отправляет через `SOLANA_RPC_URL`. Всё остальное — через Jupiter (`/order` → `/execute`, Jupiter сам доводит транзакцию до блока). Комиссия forks — 0,5% (раздел 5.10). Сделки и график монеты на кривой с 4.2 читаются прямо с цепи (транзакции её bonding curve через наш RPC), пока GeckoTerminal не проиндексировал пул: сделки обновляются каждые 5 с, график — каждые 10 с.
- **Что нужно**: тот же `SOLANA_RPC_URL`, и желательно `JUP_API_KEY` (бесплатно на developers.jup.ag/portal → Scope: Functions, «Contains secret values»). Проверка: `/api/health` → `trade.rpc: true`, `trade.jupiter_key: true`; `/api/chain` → `sdk.ok: true` (функции маркета и запуска загрузили Solana SDK; там же версия Node на Netlify).
- **Покупка при запуске** на странице `/launch` и в чате: до 20 SOL (`launch.maxDevBuySol`), четвёртой транзакцией в том же бандле, после закрепления сплита.

⚠️ Не проверено вживую: торговля на кривой через SDK pump.fun 4.3.1 (инструкции `buy`/`sell` — те же, что SDK использует в своих примерах), Jupiter `/order` + `/execute` с настоящим ключом, покупка при запуске, лимиты GeckoTerminal и DexScreener под нагрузкой. На стенде всё прошло с поддельными сервисами и настоящими подписями. Первые сделки — на маленькие суммы.

## 5.9. Задание «подключи GitHub» (4.1, по желанию)

Необязательное задание рядом с шестью: **+3 000 $FORK один раз** за привязку GitHub к X-аккаунту. В «все задания выполнены» и в условие рефералки (3 задания) оно не входит.

1. **GitHub → Settings → Developer settings → OAuth Apps → New OAuth App** (лучше от организации forkwiki: Organization → Settings → Developer settings → OAuth Apps):
   - Application name: `forks`;
   - Homepage URL: `https://forks.wiki`;
   - Authorization callback URL: `https://forks.wiki/auth/github/callback` — символ в символ (точное значение — `github_connect.callback_url` в `/api/health`);
   - Enable Device Flow — не нужно.
2. Register application → скопировать **Client ID**, затем **Generate a new client secret** → скопировать секрет (показывается один раз). В чат не вставлять.
3. Netlify: `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` (Scope: Functions, секрет — «Contains secret values»), затем редеплой.
4. Supabase → SQL Editor → `supabase/migrations/0005_github.sql` → Run.
5. Проверка: `/api/health` → `db.schema: "5"`, `github_connect.ready: true`, `github_connect.missing: []`. На сайте: войти через X → плитка GitHub в блоке $FORK (или `/github`) → GitHub спросит разрешение → назад на forks.wiki, в чате «github connected: @логин · +3,000».

Как устроено: функция `netlify/functions/auth-github.mjs` (без scope: только публичный профиль), токен GitHub отзывается сразу после чтения `/user` и нигде не хранится. Начисление — `api_github_link` в SQL по uid из сессии, ключ ledger `task:<uid>:github`. Один GitHub на один X (уникальный `github_id`), перепривязать нельзя; GitHub младше 30 дней бонуса не получает. Сумма — `update tasks set reward = 5000 where id = 'github';`, возраст — `insert into app_config (key, value) values ('github.min_age_days', 90) on conflict (key) do update set value = excluded.value;`.

Пока GitHub-приложения или `0005` нет, сайт работает как раньше: без плитки GitHub, `/github` отвечает «isn't open yet».

⚠️ Не проверено вживую: настоящий GitHub OAuth (на стенде — поддельный github.com с теми же запросами: обмен кода, `/user`, отзыв токена).

## 5.10. Комиссия forks 0,5% и доля 10% (4.2)

forks зарабатывает двумя способами, и оба работают **без кошелька forks на сервере**:

1. **0,5% со сделок через forks** (`trade.feeBps: 50` в `src/config.js`; 0 — выключить):
   - **монета на кривой pump.fun** — в ту же транзакцию, которую подписывает кошелёк, сервер добавляет обычный перевод SOL на `launch.treasury`: при покупке 0,5% от SOL на входе, при продаже — 0,5% от SOL на выходе. Работает сразу, ничего настраивать не нужно;
   - **покупка при запуске** (dev buy) — так же: 0,5% от суммы, перевод в той же транзакции бандла;
   - **через Jupiter** (монеты после кривой, токены проектов, любые токены) — реферальная комиссия Jupiter: `/order` с `referralAccount` и `referralFee=50`. Jupiter оставляет себе 20% от неё, forks получает 0,4% от сделки. Нужен реферальный аккаунт (ниже); без него сделки идут без комиссии forks.
   - Комиссия видна в котировке до подписи: строка **forks fee** (`0.5% · 0.005 SOL`). Сумму считает сервер, клиент её не присылает; сервер сверяет подписанную транзакцию байт-в-байт со своей.
2. **10% creator fees каждой монеты** — это доля в сплите pump.fun (раздел 5.7). Монету создаёт кошелёк запускающего, а не наш: сплит записан в fee-sharing config pump.fun на цепи, и pump.fun сам раздаёт creator fees по долям. Доля forks уходит на `launch.treasury`, людям — на их GitHub-аккаунты. Собирать и рассылать ничего не нужно.

### Реферальный аккаунт Jupiter (`JUP_REFERRAL_ACCOUNT`)

1. Кошелёк treasury (тот же, что `launch.treasury`) в Phantom, на нём ≈0,01 SOL на аренду аккаунтов.
2. **referral.jup.ag** → Connect wallet (кошелёк treasury) → создать реферальный аккаунт в проекте **Jupiter Ultra** (проект `DkiqsTrw1u1bYFumumC7sCG2S8K25qc2vemJFHyW2wJc`; Swap API v2 работает только с аккаунтами этого проекта).
3. В том же аккаунте создать **токен-аккаунты для SOL (`So11111111111111111111111111111111111111112`) и USDC** — Jupiter берёт комиссию в SOL, стейблкоинах, LST или bluechip-токенах; если токен-аккаунта для нужной монеты нет, сделка проходит без комиссии.
4. Скопировать **адрес реферального аккаунта** (не адрес кошелька) → Netlify: `npx netlify-cli env:set JUP_REFERRAL_ACCOUNT '<адрес>'` → редеплой. Это публичный адрес, не секрет.
5. Проверка: `/api/health` → `trade.fee_bps: 50`, `trade.jupiter_fee: true`; в терминале токена проекта котировка показывает `forks fee 0.5% · in Jupiter's …% total`.
6. Накопленное забирать на referral.jup.ag → Claim (кошельком treasury).

### Как забрать 10% creator fees

Creator fees копятся в хранилище монеты на pump.fun; распределение (`distribute_creator_fees`) раздаёт их всем по долям сплита сразу — 10% приходят прямо на кошелёк treasury. Запустить его может любой кошелёк (инструкция не требует подписи получателей). На pump.fun это кнопка распределения / claim на странице монеты или в профиле — точное место в интерфейсе pump.fun меняется, проверить на первой монете. Если долго никто не распределяет — зайти на pump.fun кошельком treasury и запустить самому.

⚠️ Не проверено вживую: реферальная комиссия Jupiter (на стенде — поддельный Jupiter, который возвращает `referralAccount`), интерфейс referral.jup.ag, кнопки распределения на pump.fun (на цепи это `distribute_creator_fees` из SDK pump.fun 4.3.1). Перевод 0,5% на кривой — обычный `SystemProgram.transfer`, проверен на стенде с настоящими подписями. Первая сделка — на маленькую сумму, потом посмотреть treasury в Solscan.

## 6. Админ-сниппеты (SQL Editor)

```sql
-- Список на аирдроп (Table editor → Export CSV или так)
select x_username, wallet, allocation from profiles where allocation > 0 order by allocation desc;

-- Сколько людей прошли все задания
select count(*) from profiles p
where (select count(*) from task_completions c where c.user_id = p.id and c.completed_at is not null) = (select count(*) from tasks where active);

-- Новый пост для заданий: сначала поменять x.post в src/config.js и задеплоить, затем
-- дать всем пройти like / retweet / comment / quote заново (follow остаётся):
delete from ledger where idempotency_key like 'task:%:like' or idempotency_key like 'task:%:repost' or idempotency_key like 'task:%:comment' or idempotency_key like 'task:%:quote';
delete from task_completions where task_id in ('like', 'repost', 'comment', 'quote');
update profiles p set allocation = coalesce((select sum(amount) from ledger l where l.user_id = p.id), 0) where p.id is not null;

-- Поменять награду за задание
update tasks set reward = 2000 where id = 'follow';

-- Сколько дал X-скан: распределение и топ
select (scan->>'total')::int t, count(*) from profiles where scan is not null group by 1 order by 1;
select x_username, (scan->>'total')::int t, followers, tweets, listed, verified from profiles where scan is not null order by t desc limit 20;

-- Топ пригласивших
select p.x_username, count(*) invited, count(r.qualified_at) counted
from referrals r join profiles p on p.id = r.referrer_id group by 1 order by counted desc, invited desc limit 20;

-- Квоуты: кто и каким постом
select p.x_username, 'https://x.com/' || p.x_username || '/status/' || c.proof url, c.completed_at
from task_completions c join profiles p on p.id = c.user_id where c.task_id = 'quote' order by c.completed_at desc limit 50;

-- Деревья и репозитории по людям (статистика с карточки «your fork»)
select x_username, traces, repos_seen from profiles order by traces desc limit 20;

-- Монеты: последние запуски и кто запускал
select repo_name, symbol, mint, status, wallet, created_at, live_at from launches order by created_at desc limit 50;
-- Сколько процентов у forks в каждой живой монете (должно быть 10)
select repo_name, symbol, (select (h->>'bps')::int / 100.0 from jsonb_array_elements(split) h where h->>'kind' = 'wallet') forks_pct
from launches where status = 'live' order by live_at desc;
-- Повисшая бронь репозитория (бандл не долетел): освободить сразу, не дожидаясь 10 минут
update launches set reserved_until = now() where repo = 'owner/name' and status = 'reserved';
-- Лимит запусков на кошелёк в сутки
insert into app_config (key, value) values ('launch.per_day', 3) on conflict (key) do update set value = excluded.value;

-- Пересканировать один аккаунт (снимает прошлое начисление; новое — при следующем входе)
delete from ledger where idempotency_key = 'scan:' || (select id from profiles where x_username = 'handle');
update profiles set scan = null, scan_seen = false,
  allocation = coalesce((select sum(amount) from ledger l where l.user_id = profiles.id), 0)
where x_username = 'handle';
```

Если менять суммы, поправь и надпись на кнопке: `quest.total` в `src/config.js`.
