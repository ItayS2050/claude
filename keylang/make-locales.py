#!/usr/bin/env python3
"""Generate _locales/*/messages.json for every UI string in the extension.

    python3 make-locales.py

One table, four columns. Authoring the translations side by side is the point:
a missing cell is visible here, where it is a blank in a column, rather than
discovered by a user staring at an English button inside a Hebrew interface.

Keys are referenced from popup.html, welcome.html, whats-new.html (via the
data-i18n attribute) and content.js (via t()).

UI_LOCALES decides which languages actually ship a translated interface.
Everything not listed there ships only the two strings the Web Store reads —
the name and the short description — so the listing is findable in that
language while the extension itself stays in English.

That works because Chrome falls back to default_locale for any message a
locale does not define, and because every t() call in our code also carries
its English as a fallback. Belt and braces: a Hebrew user with no Hebrew
catalogue gets English, not blanks.

The translations below are written and tested; they are simply not switched
on. Adding "he" to UI_LOCALES and rebuilding is the whole of shipping the
Hebrew interface, and removing it again is the whole of taking it back.
"""
import io
import json
import pathlib

HERE = pathlib.Path(__file__).parent
LOCALES = ("en", "he", "ru", "ko")

# Languages that ship a store listing but nothing else. Kiko corrects six
# languages and the listing only spoke four of them, so a Ukrainian or an Arabic
# speaker searching in their own language found nothing — two of the six with no
# presence in their own market at all.
#
# Kept apart from the table below rather than added as three more columns,
# because that table has a hundred rows and these locales need two of them. A
# language graduates by moving its strings into M and being added to LOCALES,
# which is when the rest of the interface has been translated and read.
LISTING_ONLY = {
    "uk": (
        "Kiko – виправлення розкладки клавіатури",
        "Не та розкладка? Kiko знайде і одним кліком виправить текст українською, івритом, російською, корейською, грецькою, арабською.",
    ),
    "el": (
        "Kiko – διόρθωση λάθους διάταξης πληκτρολογίου",
        "Λάθος διάταξη; Το Kiko εντοπίζει ελληνικά, εβραϊκά, ρωσικά, ουκρανικά, κορεατικά και αραβικά και τα διορθώνει με ένα κλικ.",
    ),
    "ar": (
        "Kiko – تصحيح الكتابة بتخطيط لوحة مفاتيح خاطئ",
        "تخطيط لوحة المفاتيح خاطئ؟ يكتشف Kiko العربية والعبرية والروسية والأوكرانية والكورية واليونانية ويصححها بنقرة واحدة.",
    ),
}

# Languages whose interface we ship. Empty means listings only.
# Do not add a language here until a native speaker has read the strings —
# a wrong translation in a paid product costs more than an English one.
UI_LOCALES = frozenset()

# What every locale carries regardless: the two strings the Web Store reads.
LISTING_KEYS = ("extName", "extDescription")

# key: (en, he, ru, ko)
M = {
# ── Store listing ─────────────────────────────────────────────────────────
"extName": (
 "Kiko – Multilingual Keyboard Layout Fixer",
 "Kiko – תיקון הקלדה בפריסת מקלדת שגויה",
 "Kiko – исправление раскладки клавиатуры",
 "Kiko – 자판 오타 교정기"),
"extDescription": (
 "Wrong keyboard layout? Kiko catches Hebrew, Russian, Ukrainian, Korean, Greek & Arabic typing mix-ups and fixes them in one click.",
 "שכחת להחליף שפה? Kiko תופס הקלדה בעברית, רוסית, אוקראינית, קוריאנית, יוונית וערבית בפריסה הלא נכונה ומתקן בלחיצה.",
 "Не та раскладка? Kiko найдёт и в один клик исправит текст на русском, украинском, иврите, корейском, греческом, арабском.",
 "자판 바꾸는 걸 잊으셨나요? Kiko가 히브리어·러시아어·우크라이나어·한국어·그리스어·아랍어 오타를 찾아 클릭 한 번으로 고쳐 줍니다."),

# Writing direction of the interface itself, which is not the same question as
# the direction of the text being corrected: a Hebrew speaker fixing English
# still wants the toast laid out right to left.
"uiDir": ("ltr", "rtl", "ltr", "ltr"),

# The line under the title in the popup. Not assembled from the language keys
# at runtime: the separators and the word for "and" differ per language, and
# stitching a list together in code gets that wrong in most of them.
"langLine": (
 "Hebrew, Russian, Ukrainian, Korean, Greek & Arabic ↔ English",
 "עברית, רוסית, אוקראינית, קוריאנית, יוונית וערבית ↔ אנגלית",
 "иврит, русский, украинский, корейский, греческий, арабский ↔ английский",
 "히브리어, 러시아어, 우크라이나어, 한국어, 그리스어, 아랍어 ↔ 영어"),

# ── Language names, as they appear inside toast labels ────────────────────
"langEnglish":   ("English",   "אנגלית",    "английский", "영어"),
"langHebrew":    ("Hebrew",    "עברית",     "иврит",      "히브리어"),
"langRussian":   ("Russian",   "רוסית",     "русский",    "러시아어"),
"langUkrainian": ("Ukrainian", "אוקראינית", "украинский", "우크라이나어"),
"langKorean":    ("Korean",    "קוריאנית",  "корейский",  "한국어"),
"langGreek":     ("Greek",     "יוונית",    "греческий",  "그리스어"),
"langArabic":    ("Arabic",    "ערבית",     "арабский",   "아랍어"),

# ── The toast ─────────────────────────────────────────────────────────────
"toastLooksLike": (
 "Wrong layout? Looks like $LANG$:",
 "מקלדת לא נכונה? נראה כמו $LANG$:",
 "Не та раскладка? Похоже на $LANG$:",
 "자판이 잘못됐나요? $LANG$ 같습니다:"),
"toastFix":    ("Fix → $LANG$", "תקן ל$LANG$",      "Исправить → $LANG$", "$LANG$로 고치기"),
"toastReject": ("Not $LANG$",   "זה לא $LANG$",      "Не $LANG$",          "$LANG$ 아니에요"),
"toastFooter": (
 "Drag · Alt+Shift+K to scan field",
 "אפשר לגרור · Alt+Shift+K לסריקת השדה",
 "Перетащите · Alt+Shift+K — проверить поле",
 "드래그 가능 · Alt+Shift+K로 입력창 검사"),
"toastPause":      ("Pause Kiko",         "השהה את Kiko",      "Пауза",             "Kiko 일시중지"),
"toastPauseTitle": ("Pause auto-detection","השהיית זיהוי אוטומטי","Приостановить автоопределение","자동 감지 일시중지"),
"toastSoundTitle": ("Toggle sound",       "צליל",              "Звук",              "소리 켜기/끄기"),
"toastDismiss":    ("Dismiss (Esc)",      "סגירה (Esc)",       "Закрыть (Esc)",     "닫기 (Esc)"),
"hintOpen":        ("Click to open fix",  "לחץ כדי לפתוח את התיקון","Открыть исправление","클릭해서 수정 열기"),
"hintDismiss":     ("Dismiss",            "סגירה",             "Закрыть",           "닫기"),

# ── Trial notices ─────────────────────────────────────────────────────────
"trialEndedTitle": (
 "Your free trial has ended",
 "תקופת הניסיון הסתיימה",
 "Пробный период закончился",
 "무료 체험이 끝났습니다"),
"trialEndedBody": (
 "Kiko has stopped correcting layout mistakes. Your learned words are safe — subscribing switches detection straight back on.",
 "Kiko הפסיק לתקן טעויות מקלדת. המילים שלמד נשמרו — מנוי מחזיר את הזיהוי מיד.",
 "Kiko перестал исправлять раскладку. Выученные слова сохранены — подписка сразу включит распознавание обратно.",
 "Kiko가 자판 오타 교정을 멈췄습니다. 배운 단어는 그대로 있고, 구독하면 바로 다시 켜집니다."),
"trialEndedCta": ("Keep Kiko", "להשאיר את Kiko", "Оставить Kiko", "Kiko 계속 쓰기"),
"trialLeftTitle": (
 "$DAYS$ days left of your free trial",
 "נשארו $DAYS$ ימים לתקופת הניסיון",
 "До конца пробного периода $DAYS$ дней",
 "무료 체험 $DAYS$일 남았습니다"),
"trialLastDayTitle": (
 "Last day of your free trial",
 "היום האחרון של תקופת הניסיון",
 "Последний день пробного периода",
 "무료 체험 마지막 날입니다"),
"trialBody": (
 "After that Kiko stops correcting layout mistakes. $$5/month, or $$40 for the year. Nothing has been charged so far.",
 "אחר כך Kiko מפסיק לתקן טעויות מקלדת. $$5 לחודש, או $$40 לשנה. עד עכשיו לא חויבת בכלום.",
 "После этого Kiko перестанет исправлять раскладку. $$5 в месяц или $$40 в год. Пока с вас ничего не списывали.",
 "그 뒤로는 자판 교정이 멈춥니다. 월 $$5 또는 연 $$40. 지금까지 청구된 것은 없습니다."),
"trialCta":  ("See the plans", "לראות את המסלולים", "Посмотреть тарифы", "요금제 보기"),
"notNow":    ("Not now",       "לא עכשיו",          "Не сейчас",         "나중에"),

# ── Welcome screen ────────────────────────────────────────────────────────
"welcomeTitle": ("Welcome to Kiko", "ברוך הבא ל-Kiko", "Добро пожаловать в Kiko", "Kiko에 오신 것을 환영합니다"),
"welcomeSub": (
 "Kiko watches what you type and fixes wrong-layout mistakes in one click.",
 "Kiko שם לב למה שאתה כותב ומתקן טעויות מקלדת בלחיצה אחת.",
 "Kiko следит за тем, что вы печатаете, и исправляет раскладку в один клик.",
 "Kiko는 입력을 지켜보다가 자판 오타를 클릭 한 번으로 고쳐 줍니다."),
"welcomeAsk": (
 "First — which language(s) do you type in?",
 "קודם כול — באילו שפות אתה כותב?",
 "Сначала: на каких языках вы печатаете?",
 "먼저, 어떤 언어로 입력하시나요?"),
"welcomeSelect": ("Select your language(s)", "בחר את השפות שלך", "Выберите свои языки", "언어를 선택하세요"),
"welcomeExample": (
 "Typed $TYPED$ but meant $MEANT$",
 "כתבת $TYPED$ והתכוונת ל$MEANT$",
 "Набрали $TYPED$, а хотели $MEANT$",
 "$TYPED$라고 쳤지만 $MEANT$를 의도했죠"),
"welcomeStart": ("Let's go →", "יאללה ←", "Поехали →", "시작하기 →"),
"welcomeNote": (
 "You can change this any time from the Kiko popup.",
 "אפשר לשנות את זה בכל רגע מהחלון של Kiko.",
 "Это можно изменить в любой момент в окне Kiko.",
 "이 설정은 Kiko 팝업에서 언제든 바꿀 수 있습니다."),
"welcomeTrial": (
 "Free for 30 days. After that it is $$5 a month, or $$40 for the year. No card needed to start.",
 "30 יום חינם. אחר כך $$5 לחודש, או $$40 לשנה. לא צריך כרטיס אשראי כדי להתחיל.",
 "30 дней бесплатно. Потом $$5 в месяц или $$40 в год. Карта для начала не нужна.",
 "30일 무료. 이후 월 $$5 또는 연 $$40. 시작할 때 카드는 필요 없습니다."),
"welcomeSkip": (
 "Skip — enable all languages for now",
 "דלג — להפעיל בינתיים את כל השפות",
 "Пропустить — включить пока все языки",
 "건너뛰기 — 일단 모든 언어 켜기"),

# ── Popup ─────────────────────────────────────────────────────────────────
"statDetected":  ("Detected",  "זוהו",    "Найдено",   "감지"),
"statConverted": ("Converted", "תוקנו",   "Исправлено","교정"),
"statRejected":  ("Rejected",  "נדחו",    "Отклонено", "거부"),
"learnedFor":    ("Learned — $LANG$ keyboard words",
                  "נלמדו — מילים במקלדת $LANG$",
                  "Выучено — слова в раскладке $LANG$",
                  "학습됨 — $LANG$ 자판 단어"),
"learnedExcluded": ("Learned — excluded (English) words",
                    "נלמדו — מילים שהוחרגו (אנגלית)",
                    "Выучено — исключённые (английские) слова",
                    "학습됨 — 제외된 (영어) 단어"),
"addWord":     ("Add word manually…", "הוספת מילה ידנית…", "Добавить слово вручную…", "직접 단어 추가…"),
"addBtn":      ("Add", "הוסף", "Добавить", "추가"),
"addWordExclude": ("Add word to exclude…", "הוספת מילה להחרגה…",
                   "Добавить слово в исключения…", "제외할 단어 추가…"),
"emptyList":   ("Nothing yet", "עדיין כלום", "Пока пусто", "아직 없음"),
"sectionLanguages": ("Languages", "שפות", "Языки", "언어"),
"sectionThisSite":  ("This site", "האתר הזה", "Этот сайт", "이 사이트"),
"sectionHelp":      ("Help", "עזרה", "Помощь", "도움말"),
"toggleLangLabel":  ("$LANG$ ↔ English", "$LANG$ ↔ אנגלית", "$LANG$ ↔ английский", "$LANG$ ↔ 영어"),
"toggleLangSub":    ("Detect $LANG$ keyboard layout mistakes",
                     "זיהוי טעויות מקלדת ב$LANG$",
                     "Находить ошибки раскладки: $LANG$",
                     "$LANG$ 자판 오타 감지"),
"activeOnSite": ("Active on this site", "פעיל באתר הזה", "Включён на этом сайте", "이 사이트에서 켜짐"),
"resetAll":     ("Reset all learned data", "איפוס כל מה שנלמד", "Сбросить всё выученное", "학습 데이터 모두 초기화"),
"shortcutScan": ("Alt + Shift + K · Scan or convert selected text on any page",
                 "Alt + Shift + K · סריקה או המרה של טקסט מסומן בכל דף",
                 "Alt + Shift + K — проверить поле или преобразовать выделенное",
                 "Alt + Shift + K · 입력창 검사 또는 선택 영역 변환"),
"shortcutAccept": ("Alt + Shift + Enter · Accept the fix  ·  Esc · Dismiss",
                 "Alt + Shift + Enter · אישור התיקון  ·  Esc · סגירה",
                 "Alt + Shift + Enter — принять исправление  ·  Esc — закрыть",
                 "Alt + Shift + Enter · 수정 적용  ·  Esc · 닫기"),
"worksAnywhere": ("Works on any website with a text field",
                  "עובד בכל אתר שיש בו שדה טקסט",
                  "Работает на любом сайте с текстовым полем",
                  "텍스트 입력창이 있는 모든 사이트에서 작동"),

# ── Toggles, banners and the review nudge ─────────────────────────────────
"autoDetect":    ("Auto-detection", "זיהוי אוטומטי", "Автоопределение", "자동 감지"),
"autoDetectSub": ("Show popup when wrong layout detected",
                  "להציג חלון כשמזוהה פריסה שגויה",
                  "Показывать окно при неверной раскладке",
                  "자판 오타가 감지되면 알림 표시"),
"soundAlert":    ("Sound alert", "צליל התראה", "Звуковой сигнал", "알림음"),
"soundAlertSub": ("Play a soft ding when wrong layout detected",
                  "צליל עדין כשמזוהה פריסה שגויה",
                  "Тихий сигнал при неверной раскладке",
                  "자판 오타가 감지되면 작은 소리로 알림"),
"soundTest":     ("Test", "בדיקה", "Проверить", "테스트"),
"pausedBanner":  ("Auto-detection is OFF — Kiko won't show any popups.",
                  "הזיהוי האוטומטי כבוי — Kiko לא יציג שום חלון.",
                  "Автоопределение выключено — Kiko ничего не покажет.",
                  "자동 감지가 꺼져 있습니다 — Kiko가 아무것도 표시하지 않습니다."),
"reEnable":      ("Re-enable auto-detection", "להפעיל מחדש זיהוי אוטומטי",
                  "Включить автоопределение", "자동 감지 다시 켜기"),
"reviewAsk":     ("Enjoying Kiko?", "נהנה מ-Kiko?", "Нравится Kiko?", "Kiko가 마음에 드시나요?"),
# Chrome's i18n has no plural forms, so the singular is its own string rather
# than "1 mistakes", which reads like a bug and undercuts the ask.
"reviewCountOne": ("Kiko has fixed one typing mistake for you.",
                 "‏Kiko תיקן לך שגיאת הקלדה אחת.",
                 "Kiko исправил вам одну опечатку.",
                 "Kiko가 오타 하나를 고쳐드렸어요."),
"reviewCount":   ("Kiko has fixed $COUNT$ typing mistakes for you.",
                 "‏Kiko תיקן לך $COUNT$ שגיאות הקלדה.",
                 "Kiko исправил вам $COUNT$ опечаток.",
                 "Kiko가 오타 $COUNT$개를 고쳐드렸어요."),
"reviewHelp":    ("Rate Kiko", "לדרג את Kiko", "Оценить Kiko", "Kiko 평가하기"),
"reviewBody":    ("A quick review helps others find it and keeps us motivated to improve!",
                  "ביקורת קצרה עוזרת לאחרים למצוא אותו ונותנת לנו דחיפה להמשיך לשפר.",
                  "Короткий отзыв помогает другим найти его и придаёт нам сил делать лучше.",
                  "짧은 리뷰 하나가 다른 사람들에게 도움이 되고, 저희에게도 큰 힘이 됩니다."),
"reviewRate":    ("Rate Kiko", "לדרג את Kiko", "Оценить Kiko", "Kiko 평가하기"),
"reviewLater":   ("Maybe later", "אולי אחר כך", "Может быть позже", "나중에"),
"removeWord":    ("Remove", "הסרה", "Удалить", "삭제"),

# ── Entitlement banner ────────────────────────────────────────────────────
"entLicensedTitle": ("Subscription active", "המנוי פעיל", "Подписка активна", "구독 중"),
"entLicensedBody":  ("Thanks — every language is unlocked.",
                     "תודה — כל השפות פתוחות.",
                     "Спасибо — все языки открыты.",
                     "감사합니다 — 모든 언어가 열려 있습니다."),
"entTrialTitle":    ("$DAYS$ days left in your free trial",
                     "נשארו $DAYS$ ימים לתקופת הניסיון",
                     "До конца пробного периода $DAYS$ дней",
                     "무료 체험 $DAYS$일 남음"),
"entTrialLastDay":  ("Last day of your free trial",
                     "היום האחרון של תקופת הניסיון",
                     "Последний день пробного периода",
                     "무료 체험 마지막 날"),
"entTrialBody":     ("Everything works. Subscribe any time to keep it after the trial.",
                     "הכול עובד. אפשר לעשות מנוי בכל רגע כדי להמשיך אחרי הניסיון.",
                     "Всё работает. Оформить подписку можно в любой момент.",
                     "모든 기능이 켜져 있습니다. 체험 후에도 쓰려면 언제든 구독하세요."),
"entExpiredTitle":  ("Your free trial has ended", "תקופת הניסיון הסתיימה",
                     "Пробный период закончился", "무료 체험이 끝났습니다"),
"entExpiredBody":   ("Detection is paused. Your learned words are safe — subscribe to switch it back on.",
                     "הזיהוי מושהה. המילים שנלמדו נשמרו — מנוי מחזיר אותו לפעולה.",
                     "Распознавание приостановлено. Выученные слова сохранены — подписка включит его обратно.",
                     "감지가 멈췄습니다. 배운 단어는 그대로이고, 구독하면 다시 켜집니다."),
"entCta":       ("Subscribe — $$5/month or $$40/year",
                 "מנוי — $$5 לחודש או $$40 לשנה",
                 "Подписка — $$5 в месяц или $$40 в год",
                 "구독 — 월 $$5 또는 연 $$40"),
"keyPlaceholder": ("Already paid? Paste licence key",
                   "כבר שילמת? הדבק מפתח רישיון",
                   "Уже оплатили? Вставьте лицензионный ключ",
                   "이미 결제하셨나요? 라이선스 키를 붙여넣으세요"),
"keyActivate":  ("Activate", "הפעלה", "Активировать", "활성화"),

# ── The paywall announcement, shown once to pre-4.5.0 installs ────────────
"wnTitle": ("Kiko is becoming a paid product",
            "Kiko הופך למוצר בתשלום",
            "Kiko становится платным",
            "Kiko가 유료로 전환됩니다"),
"wnSub": ("You've been using it since before that was true, so this is the fair version.",
          "אתה משתמש בו מלפני שזה היה נכון, אז הנה הגרסה ההוגנת.",
          "Вы пользуетесь им с тех пор, когда это было не так — поэтому вот честный вариант.",
          "그 전부터 써 오셨으니, 공정하게 가겠습니다."),
"wnBannerTitle": ("Your free period: 60 days", "התקופה החינמית שלך: 60 יום",
                  "Ваш бесплатный период: 60 дней", "무료 기간: 60일"),
"wnBannerSub": ("Nothing changes today. Nothing is charged. No card, no account.",
                "היום לא משתנה כלום. לא מחייבים. בלי כרטיס, בלי חשבון.",
                "Сегодня ничего не меняется. Ничего не списывается. Без карты и без аккаунта.",
                "오늘 달라지는 것은 없습니다. 청구도 없습니다. 카드도, 계정도 필요 없습니다."),
"wnBody1": ("Kiko has been free the whole time you've had it. Keeping it going — six languages now, more coming — is real work, so from this version it costs money.",
            "Kiko היה חינם כל הזמן שהוא אצלך. להחזיק אותו — שש שפות היום, ועוד בדרך — זו עבודה אמיתית, ולכן מהגרסה הזאת הוא עולה כסף.",
            "Всё это время Kiko был бесплатным. Поддерживать его — шесть языков сейчас, будут ещё — это настоящая работа, поэтому с этой версии он платный.",
            "그동안 Kiko는 계속 무료였습니다. 지금 6개 언어, 앞으로 더 늘려 가며 유지하는 일은 실제 작업이라 이번 버전부터는 유료로 전환합니다."),
"wnBody2": ("You installed before there was a price, so you get 60 days rather than the 30 a new user gets. Everything keeps working exactly as it does now for that whole time.",
            "התקנת לפני שהיה מחיר, ולכן אתה מקבל 60 יום ולא 30 כמו משתמש חדש. כל הזמן הזה הכול ממשיך לעבוד בדיוק כמו עכשיו.",
            "Вы установили его до того, как появилась цена, поэтому у вас 60 дней вместо 30, которые получает новый пользователь. Всё это время всё работает ровно так же.",
            "가격이 생기기 전에 설치하셨기 때문에, 신규 사용자의 30일이 아니라 60일을 드립니다. 그동안 모든 기능은 지금과 똑같이 작동합니다."),
"wnMonthly": ("Cancel any time", "אפשר לבטל בכל רגע", "Отмена в любой момент", "언제든 해지"),
"wnAnnual":  ("Two months free", "חודשיים במתנה", "Два месяца в подарок", "두 달 무료"),
"wnRemind":  ("Not now — remind me later", "לא עכשיו — להזכיר לי אחר כך",
              "Не сейчас — напомнить позже", "나중에 — 다시 알려 주세요"),
"wnFoot1": ("Your learned words stay on your machine either way, and nothing you type has ever left your device. If you decide not to subscribe, detection stops and nothing is deleted.",
            "המילים שנלמדו נשארות אצלך במחשב בכל מקרה, ושום דבר שכתבת מעולם לא עזב את המכשיר. אם תחליט לא לעשות מנוי, הזיהוי נפסק ושום דבר לא נמחק.",
            "Выученные слова в любом случае остаются на вашем компьютере, и ничего из набранного вами никогда не покидало устройство. Если подписку не оформить, распознавание выключится, но ничего не удалится.",
            "어느 쪽이든 배운 단어는 기기에 그대로 남고, 입력한 내용이 기기를 떠난 적은 없습니다. 구독하지 않으시면 감지만 멈출 뿐 삭제되는 것은 없습니다."),
"wnFoot2": ("Questions, or the price doesn't work for you? Reply to",
            "יש שאלות, או שהמחיר לא מסתדר לך? כתוב אלינו ל-",
            "Есть вопросы или цена не подходит? Напишите на",
            "궁금한 점이 있거나 가격이 부담되시나요? 다음으로 알려 주세요:"),
"wnFoot3": ("we read everything.", "אנחנו קוראים הכול.", "мы читаем всё.", "모두 읽습니다."),
"wnLicensedTitle": ("You already subscribe — thank you", "כבר יש לך מנוי — תודה",
                    "У вас уже есть подписка — спасибо", "이미 구독 중이십니다 — 감사합니다"),
"wnLicensedSub": ("Nothing here applies to you. Every language stays unlocked.",
                  "שום דבר כאן לא נוגע לך. כל השפות נשארות פתוחות.",
                  "Ничего из этого вас не касается. Все языки остаются открытыми.",
                  "여기 내용은 해당되지 않습니다. 모든 언어가 계속 열려 있습니다."),
"wnExpiredTitle": ("Your free period has ended", "התקופה החינמית הסתיימה",
                   "Бесплатный период закончился", "무료 기간이 끝났습니다"),
"wnExpiredSub": ("Detection is paused. Your learned words are safe and nothing was deleted.",
                 "הזיהוי מושהה. המילים שנלמדו נשמרו ושום דבר לא נמחק.",
                 "Распознавание приостановлено. Выученные слова сохранены, ничего не удалено.",
                 "감지가 멈췄습니다. 배운 단어는 안전하며 삭제된 것은 없습니다."),
"wnDaysLeft": ("$DAYS$ days left of your free period",
               "נשארו $DAYS$ ימים לתקופה החינמית",
               "До конца бесплатного периода $DAYS$ дней",
               "무료 기간 $DAYS$일 남았습니다"),
"wnOneDayLeft": ("One day left of your free period", "נשאר יום אחד לתקופה החינמית",
                 "Остался один день бесплатного периода", "무료 기간 하루 남았습니다"),

# ── Help links ────────────────────────────────────────────────────────────
"helpReport":  ("Report a problem", "דיווח על תקלה", "Сообщить о проблеме", "문제 신고"),
"helpSupport": ("Help and support", "עזרה ותמיכה", "Помощь и поддержка", "도움말 및 지원"),
"helpBilling": ("Manage or cancel subscription", "ניהול או ביטול מנוי",
                "Управление подпиской или отмена", "구독 관리 또는 해지"),
"helpPrivacy": ("Privacy", "פרטיות", "Конфиденциальность", "개인정보"),
"helpTerms":   ("Terms", "תנאים", "Условия", "이용약관"),
"helpRefunds": ("Refunds", "החזרים", "Возвраты", "환불"),
}

PLACEHOLDERS = {
    "$LANG$":  ("lang",  "$1"),
    "$DAYS$":  ("days",  "$1"),
    "$TYPED$": ("typed", "$1"),
    "$COUNT$": ("count", "$1"),
    "$MEANT$": ("meant", "$2"),
}


def entry(text):
    """A messages.json entry, declaring any placeholders the text uses.

    Chrome requires every $NAME$ in a message to have a matching placeholder
    definition, and silently renders the raw $NAME$ if one is missing."""
    out = {"message": text}
    used = [p for p in PLACEHOLDERS if p in text]
    if used:
        # Order matters: $1 is the first substitution passed to getMessage.
        ordered = sorted(used, key=lambda p: PLACEHOLDERS[p][1])
        out["placeholders"] = {
            PLACEHOLDERS[p][0]: {"content": PLACEHOLDERS[p][1]} for p in ordered
        }
    return out


def main():
    limits = {"extName": 75, "extDescription": 132}
    problems = []
    for code, (name, desc) in LISTING_ONLY.items():
        if code in LOCALES:
            problems.append(f"{code}: in both LOCALES and LISTING_ONLY")
    for i, code in enumerate(LOCALES):
        # The default locale always carries everything: it is what every other
        # locale falls back to.
        full = (code == "en") or (code in UI_LOCALES)
        msgs = {}
        for key, texts in M.items():
            if not full and key not in LISTING_KEYS:
                continue
            text = texts[i]
            if not text:
                problems.append(f"{code}: {key} is empty")
                continue
            if key in limits and len(text) > limits[key]:
                problems.append(f"{code} {key}: {len(text)} chars, limit {limits[key]}")
            msgs[key] = entry(text)
        d = HERE / "_locales" / code
        d.mkdir(parents=True, exist_ok=True)
        (d / "messages.json").write_text(
            json.dumps(msgs, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        kind = "full interface" if full else "listing only"
        print(f"  _locales/{code}/messages.json  {len(msgs):>3} strings  ({kind})")
    for code, (name, desc) in LISTING_ONLY.items():
        msgs = {}
        for key, text in (("extName", name), ("extDescription", desc)):
            if not text:
                problems.append(f"{code}: {key} is empty")
                continue
            if len(text) > limits[key]:
                problems.append(f"{code} {key}: {len(text)} chars, limit {limits[key]}")
            msgs[key] = entry(text)
        d = HERE / "_locales" / code
        d.mkdir(parents=True, exist_ok=True)
        (d / "messages.json").write_text(
            json.dumps(msgs, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"  _locales/{code}/messages.json  {len(msgs):>3} strings  (listing only)")

    if problems:
        raise SystemExit("problems:\n  " + "\n  ".join(problems))


if __name__ == "__main__":
    main()
