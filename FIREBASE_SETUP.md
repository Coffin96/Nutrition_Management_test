# Налаштування Firebase для Гімназії №4

## Крок 1: Створення проекту Firebase (5 хв)

1. Перейдіть на [console.firebase.google.com](https://console.firebase.google.com)
2. Натисніть **"Додати проект"** (Add project)
3. Введіть назву: `gym4-nutrition`
4. Вимкніть Google Analytics (не потрібно)
5. Натисніть **"Створити проект"**

## Крок 2: Налаштування Realtime Database (3 хв)

1. У лівому меню виберіть **"Realtime Database"**
2. Натисніть **"Створити базу даних"** (Create Database)
3. Оберіть розташування: **europe-west1** (найближче до України)
4. Режим безпеки: **"Почати в тестовому режимі"** (Start in test mode)
   - ⚠️ Тестовий режим дозволяє читати/писати всім. Ми налаштуємо правила пізніше.
5. Натисніть **"Увімкнути"**

## Крок 3: Отримання конфігурації (2 хв)

1. У лівому меню натисніть значок ⚙️ (Settings) → **"Налаштування проекту"**
2. Прокрутіть вниз до розділу **"Ваші додатки"**
3. Натисніть на значок **</> (Web)**
4. Введіть псевдонім додатку: `gym4-web`
5. **НЕ** вмикайте Firebase Hosting
6. Натисніть **"Зареєструвати додаток"**

Скопіюйте конфігурацію (виглядає приблизно так):

```javascript
const firebaseConfig = {
  apiKey: "AIzaSyA1B2C3D4E5F6G7H8I9J0K1L2M3N4O5P6Q",
  authDomain: "gym4-nutrition.firebaseapp.com",
  databaseURL: "https://gym4-nutrition-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "gym4-nutrition",
  storageBucket: "gym4-nutrition.appspot.com",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:abc123def456ghi789"
};
```

## Крок 4: Оновлення app.js (1 хв)

Відкрийте файл `app.js` і знайдіть:

```javascript
const CONFIG = {
    FIREBASE_CONFIG: {
        apiKey: "YOUR_API_KEY",
        authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
        databaseURL: "https://YOUR_PROJECT_ID-default-rtdb.firebaseio.com",
        projectId: "YOUR_PROJECT_ID",
        storageBucket: "YOUR_PROJECT_ID.appspot.com",
        messagingSenderId: "YOUR_SENDER_ID",
        appId: "YOUR_APP_ID"
    },
```

Замініть на вашу конфігурацію з кроку 3.

## Крок 5: Налаштування правил безпеки (5 хв)

1. Поверніться до **Realtime Database**
2. Перейдіть на вкладку **"Правила"** (Rules)
3. Замініть вміст на:

```json
{
  "rules": {
    "classes": {
      ".read": true,
      ".write": true
    },
    "reports": {
      ".read": true,
      "$date": {
        ".write": true,
        "$classId": {
          ".validate": "newData.hasChildren(['id', 'classId', 'date', 'totalStudents', 'actualStudents', 'eatingStudents', 'teacherEating', 'teacherName', 'timestamp'])"
        }
      }
    },
    "config": {
      ".read": true,
      ".write": true
    }
  }
}
```

4. Натисніть **"Опублікувати"** (Publish)

### Пояснення правил:

- `".read": true` - дозволяє читати всім (потрібно для їдальні)
- `".write": true` - дозволяє писати всім (ви можете додати авторизацію пізніше)
- `.validate` - перевіряє структуру даних перед записом

⚠️ **Важливо**: Ці правила дозволяють доступ без автентифікації. Для продакшену рекомендується додати Firebase Authentication.

## Крок 6: Тестування (2 хв)

1. Викладіть оновлені файли на GitHub Pages
2. Відкрийте сайт
3. Перевірте консоль (F12):
   - Має з'явитись зелений "CLOUD SYNC"
   - Не повинно бути помилок Firebase

4. Увійдіть як адміністратор (PIN: 1312)
5. Додайте тестовий клас
6. Перезавантажте сторінку
7. Якщо клас залишився - Firebase працює! ✅

## Крок 7: Перевірка даних у Firebase (1 хв)

1. Поверніться до Firebase Console
2. Realtime Database → Вкладка **"Дані"** (Data)
3. Ви маєте побачити структуру:

```
gym4-nutrition-default-rtdb
├── classes
│   ├── 1a
│   ├── 2b
│   └── ...
├── reports
│   └── 2025-02-03
│       ├── 1a
│       └── ...
└── config
    └── canteen_pin: "5555"
```

## Додаткові налаштування

### Встановлення лімітів (опціонально)

Realtime Database → Вкладка **"Використання"** (Usage):
- Можна встановити ліміти на читання/запис
- Firebase Free: 1 GB зберігання, 10 GB/місяць трафік
- Більше ніж достатньо для школи

### Резервне копіювання

1. Realtime Database → **⋮** → **"Експорт JSON"**
2. Зберігайте backup раз на тиждень
3. Імпорт: **⋮** → **"Імпорт JSON"**

### Моніторинг

Firebase Console → Analytics → Usage and billing:
- Перевіряйте використання раз на місяць
- Встановіть бюджетні сповіщення

## Усунення проблем

### "Firebase not initialized"
- Перевірте, чи правильно скопійовано конфігурацію
- Перевірте, чи завантажився Firebase SDK (F12 → Network)

### "Permission denied"
- Перевірте правила безпеки
- Переконайтеся, що тестовий режим увімкнено

### Дані не зберігаються
- F12 → Console - перевірте помилки
- Перевірте databaseURL в конфігурації
- Переконайтеся, що правила дозволяють `.write: true`

## Безпека для продакшену

Після тестування рекомендується:

1. Увімкнути Firebase Authentication
2. Оновити правила:

```json
{
  "rules": {
    ".read": "auth != null",
    ".write": "auth != null"
  }
}
```

3. Додати ролі (admin, teacher, canteen)

Детальна інструкція з аутентифікації - за запитом.

---
**Загальний час налаштування:** 15-20 хвилин
**Вартість:** $0/місяць (Firebase Free Plan)
