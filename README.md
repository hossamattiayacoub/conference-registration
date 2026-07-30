# استمارة تسجيل المؤتمر — Angular + Google Apps Script

تطبيق ويب لتسجيل حضور المؤتمر، بواجهة Angular عربية (RTL) وخلفية Google Apps Script
تستخدم Google Sheets كقاعدة بيانات و Google Drive لتخزين الصور.

> ⚠️ لم يتم إرفاق أي لقطات شاشة (screenshots) مع الطلب، رغم أن الوصف يشير إليها. تم بناء
> الواجهة اعتمادًا على الوصف النصي التفصيلي للحقول والأقسام. إن توفرت اللقطات لاحقًا،
> يسهل تعديل `registration.component.html/scss` لمطابقتها بدقة أكبر.

---

## 1. البنية

```
conference-registration/
├── src/
│   ├── app/
│   │   ├── core/
│   │   │   ├── models/            # Registration, ApiResponse + constants
│   │   │   └── services/          # RegistrationApiService (HttpClient)
│   │   ├── features/
│   │   │   └── registration/      # الشاشة الرئيسية (الاستمارة)
│   │   ├── shared/
│   │   │   ├── validators/        # موبايل مصري / رقم قومي / صورة / نص عربي
│   │   │   └── utils/             # تحويل الملفات إلى Base64
│   │   ├── app.component.ts
│   │   ├── app.config.ts
│   │   └── app.routes.ts
│   ├── environments/               # عنوان الـ Apps Script Web App
│   ├── index.html                  # lang="ar" dir="rtl"
│   └── styles.scss
├── apps-script/
│   ├── Code.gs                     # doGet / doPost + CRUD
│   ├── Config.gs                   # كل القيم القابلة للتهيئة
│   └── Utils.gs                    # مساعدات: الردود، الشيت، الرفع، التحقق
├── angular.json
├── package.json
└── tsconfig*.json
```

---

## 2. تشغيل الواجهة الأمامية محليًا

```bash
cd conference-registration
npm install
npm start           # يفتح على http://localhost:4200
```

للبناء الإنتاجي:

```bash
npm run build
```

الناتج يكون في `dist/conference-registration`.

---

## 3. نشر الخلفية (Google Apps Script)

1. افتح https://script.google.com وأنشئ مشروعًا جديدًا (New project).
2. أنشئ 3 ملفات بنفس الأسماء وانسخ محتوى كل ملف من مجلد `apps-script/`:
   - `Code.gs`
   - `Config.gs`
   - `Utils.gs`
3. في `Config.gs`، تأكد من:
   - `SPREADSHEET_ID` يشير إلى الشيت الصحيح (موجود بالفعل بالقيمة الصحيحة).
   - `SHEET_NAME` يبقى `'Registeration'` بنفس التهجئة (بدون تعديل).
   - استبدل القيم التالية بمعرفات (Folder ID) فعلية من Google Drive:
     ```js
     FRONT_ID_FOLDER_ID: 'PASTE_FRONT_ID_FOLDER_ID_HERE',
     BACK_ID_FOLDER_ID: 'PASTE_BACK_ID_FOLDER_ID_HERE',
     PERSONAL_PHOTO_FOLDER_ID: 'PASTE_PERSONAL_PHOTO_FOLDER_ID_HERE',
     ```
     (أنشئ 3 مجلدات منفصلة في Drive، وانسخ الـ ID من رابط كل مجلد.)
4. من محرر Apps Script، اختر الدالة `initializeSheet` من القائمة المنسدلة للدوال
   ثم اضغط **Run** لإنشاء صف العناوين (Headers) تلقائيًا إذا كان الشيت فارغًا.
5. عند التشغيل الأول سيطلب منك Google **تفويض الصلاحيات (Authorize)** للوصول إلى
   Sheets و Drive — وافق على الصلاحيات المطلوبة.
6. انشر المشروع كتطبيق ويب:
   - **Deploy → New deployment**
   - Type: **Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
   - اضغط **Deploy** وانسخ رابط الـ **Web app URL** الناتج (ينتهي بـ `/exec`).
7. الصق هذا الرابط في:
   - `src/environments/environment.ts`
   - `src/environments/environment.prod.ts`

   ```ts
   export const environment = {
     production: false,
     appsScriptApiUrl: 'https://script.google.com/macros/s/XXXXXXXX/exec'
   };
   ```

> ملاحظة تقنية: طلبات POST من الواجهة تُرسل بـ `Content-Type: text/plain` عمدًا،
> لأن Google Apps Script Web Apps لا تدعم `doOptions` (preflight)، ومازال Apps Script
> يقرأ الجسم عبر `e.postData.contents` ويحلله كـ JSON بغض النظر عن نوع المحتوى المُعلن.

---

## 4. اختبار التكامل

بعد لصق رابط الـ API في `environment.ts` وتشغيل `npm start`:

1. **تسجيل جديد**: املأ كل الحقول المطلوبة، ارفع الصور الثلاث، اضغط **إرسال**.
   تحقق من ظهور رسالة نجاح، ومن إضافة صف جديد في شيت **Registeration**.
2. **البحث برقم الموبايل**: اكتب رقم موبايل مسجل مسبقًا في حقل الموبايل واضغط **بحث** —
   يجب أن تُحمَّل كل بيانات التسجيل تلقائيًا في الاستمارة.
3. **تحميل تسجيل موجود عند التكرار**: حاول إنشاء تسجيل جديد بنفس رقم موبايل مستخدم من قبل؛
   يجب أن تظهر رسالة "يوجد تسجيل بالفعل باستخدام رقم الموبايل ده" مع زر لتحميل بياناته.
4. **تعديل تسجيل**: بعد تحميل تسجيل (بحث أو تكرار)، عدّل أي حقل واضغط **إرسال** مجددًا —
   يجب أن يُحدَّث نفس الصف بدلاً من إنشاء صف جديد (`UpdatedAt` يتغير، `CreatedAt` يبقى كما هو).
5. **الصور في Drive**: افتح المجلدات الثلاثة التي حددتها في `Config.gs` وتأكد من رفع
   الصور، وأن روابطها (`FrontIdFileUrl`, `BackIdFileUrl`, `PersonalPhotoFileUrl`)
   محفوظة في الشيت وتعمل عند فتحها.

---

## 5. تخصيص قائمة الخدام

قائمة أسماء الخدام موجودة في مكان واحد فقط لسهولة التعديل:

```ts
// src/app/core/models/registration.model.ts
export const SERVANT_OPTIONS: string[] = [
  'فادي أمجد',
  'كيرلس طانيوس',
  'مريم سامي',
  'مارينا ملاك',
  'اميره سيدهم',
  'بولا لطفي'
];
```

أضف/احذف أسماء من هذه المصفوفة فقط، وستظهر التغييرات تلقائيًا في الاستمارة.
