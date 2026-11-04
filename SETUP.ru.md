# forks — настройка X, Supabase и Netlify

Без этой настройки сайт уже работает: архив, модель (если есть `FORKS_LLM_KEY`) и `/freeforks` в демо-режиме вне forks.wiki. Ниже — как включить настоящий вход через X и задания с записью в базу.

## 0. Что нужно заполнить

| Где | Что | Пример |
|---|---|---|
| `src/config.js` → `x.handle` | X-аккаунт для задания follow, без `@` | `forkwikis` |
| `src/config.js` → `x.post` | ID поста для like / repost / comment (число из `x.com/<автор>/status/<ID>`) | `20` |
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
2. SQL Editor → вставить `supabase/migrations/0001_init.sql` → Run, затем `supabase/migrations/0002_scan.sql` → Run. Обе можно запускать повторно; порядок важен. Если база уже была на 3.2 — достаточно запустить `0002_scan.sql`. Пока 0002 не запущена, вход работает, но без X-скана, а `/api/health` пишет её в `migrations`.
3. Advisors → Security: не должно быть «RLS disabled».
4. Project Settings → API (или API Keys):
   - `SUPABASE_URL` = Project URL;
   - `SUPABASE_SERVICE_ROLE_KEY` = service_role или secret key (`sb_secret_…`). **Только сервер.**
5. Бесплатный проект засыпает после недели без запросов: Restore в дашборде.

## 3. Netlify

1. Как заливать. **Не перетаскивай zip в Netlify**: так загрузится только страница, без функций, и деревья не построятся (`/api/trace` будет 404). Два рабочих способа:
   - **Netlify CLI с компьютера** (нужен Node 18+). Из распакованной папки проекта:
     ```bash
     npx netlify-cli login          # один раз
     npx netlify-cli link           # один раз: выбрать сайт forks.wiki
     npx netlify-cli deploy --prod  # каждый раз, когда заливаешь новую версию
     ```
   - **Из GitHub**: Netlify → Site configuration → Build & deploy → Link repository → `forkwiki/fork`. Тогда каждый пуш в репозиторий сам обновляет сайт.
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

3. **После изменения env заново задеплой** (`npx netlify-cli deploy --prod` или Deploys → Trigger deploy). Без этого функции не видят новые значения.
4. Открыть `https://forks.wiki/api/health`. Ждём `"ok": true`; `missing` и `config` пустые, `db.ok: true`, `db.schema: "1"`, `github: true`, `model: true`. Поле `callback_url` скопировать в X Portal символ в символ.
5. DeepSeek работает по предоплате: сколько положил на баланс, больше не потратится. Один новый вопрос — около 700 токенов на вход (большая часть — одинаковый промпт, он идёт по цене кэша) и около 250 на выход; повторный вопрос модель не трогает (кэш на неделю). В логах функции `trace` видно токены каждого вызова.
6. Пройти вход целиком с телефона, в том числе из браузера внутри X: кнопка **get +10,000 $FORK** → sign in with x → X → назад → анимация X-скана → четыре задания → карточка «your fork» с кошельком.

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
| Нет анимации X-скана после входа | Не запущена `0002_scan.sql` (смотри `migrations` в `/api/health`) или аккаунт уже сканировался |
| «Sign-in is not set up» (`setup`) | Не заданы env в Netlify или не было редеплоя |
| «too new» (`too_new`) | Аккаунт моложе `X_MIN_ACCOUNT_AGE_DAYS` |
| upstream: «the trials open soon» | Пустые `x.handle` / `x.post` в `src/config.js` |
| upstream: «the ledger isn't answering» | `/api/me` на forks.wiki отдаёт не JSON: функции не задеплоились или упали; смотри `/api/health` и логи функций |
| `/api/*` отдаёт HTML или 404 | Деплой без функций (drag-and-drop) |
| upstream: «couldn’t reach a model or github» | Нет `FORKS_LLM_KEY` и `GITHUB_TOKEN`, или не было редеплоя |
| upstream: «this is github alone» | Нет `FORKS_LLM_KEY` (или модель недоступна): дерево только из данных GitHub |
| Задание «give it a few more seconds» | Нажали раньше 5 с — сервер считает по своим часам, повтор засчитает |

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

## 6. Админ-сниппеты (SQL Editor)

```sql
-- Список на аирдроп (Table editor → Export CSV или так)
select x_username, wallet, allocation from profiles where allocation > 0 order by allocation desc;

-- Сколько людей прошли все задания
select count(*) from profiles p
where (select count(*) from task_completions c where c.user_id = p.id and c.completed_at is not null) = (select count(*) from tasks where active);

-- Новый пост для заданий: сначала поменять x.post в src/config.js и задеплоить, затем
-- дать всем пройти like / repost / comment заново (follow остаётся):
delete from ledger where idempotency_key like 'task:%:like' or idempotency_key like 'task:%:repost' or idempotency_key like 'task:%:comment';
delete from task_completions where task_id in ('like', 'repost', 'comment');
update profiles p set allocation = coalesce((select sum(amount) from ledger l where l.user_id = p.id), 0) where p.id is not null;

-- Поменять награду за задание
update tasks set reward = 2000 where id = 'follow';

-- Сколько дал X-скан: распределение и топ
select (scan->>'total')::int t, count(*) from profiles where scan is not null group by 1 order by 1;
select x_username, (scan->>'total')::int t, followers, tweets, listed, verified from profiles where scan is not null order by t desc limit 20;

-- Деревья и репозитории по людям (статистика с карточки «your fork»)
select x_username, traces, repos_seen from profiles order by traces desc limit 20;

-- Пересканировать один аккаунт (снимает прошлое начисление; новое — при следующем входе)
delete from ledger where idempotency_key = 'scan:' || (select id from profiles where x_username = 'handle');
update profiles set scan = null, scan_seen = false,
  allocation = coalesce((select sum(amount) from ledger l where l.user_id = profiles.id), 0)
where x_username = 'handle';
```

Если менять суммы, поправь и надпись на кнопке: `quest.total` в `src/config.js`.
