# Road Cost – حاسبة تكاليف الطريق

**كل مشوار، محسوب.** رفيق عربي خاص لتخطيط تكلفة الطريق: حاسبة، سيارات محفوظة، ودفتر رحلات. بلا حسابات أو تتبّع أو خدمات مدفوعة.

**[افتح التطبيق](https://amerkallajo.github.io/taxi-fuel-calculator/)** · [تدقيق المشروع](docs/AUDIT.md) · [تقرير الإصدار](docs/RELEASE.md)

## المزايا

- عربية RTL وإنجليزية LTR، مظهر فاتح/داكن يتبع الجهاز أول مرة، وتخطيط متجاوب مع شريط نتيجة ثابت على الهاتف.
- مسافة يدوية أو طريق سيارة من الخريطة، بحث عربي/إنجليزي، GPS بطلب المستخدم، اختيار نقاط بالنقر، وتبديل الاتجاه.
- بنزين أو مازوت، كم/لتر أو لتر/100كم، أسعار يدوية، وأربع عملات. **تغيير العملة لا يحوّل المبلغ**؛ راجع السعر والإضافات بنفسك.
- ذهاب وعودة، تقسيم المصروف بما يشمل السائق، مصاريف إضافية، وهامش احتياط مالي للوقود.
- توقع شهري وسنوي لنفس الرحلة بالسعر المُدخل. خيار العودة مطبّق مرة واحدة، ولا تُضاف التوقعات للسجل تلقائياً.
- حتى 20 سيارة مع تعديل وحذف واستعمال سريع، ومقارنة وقود لنفس الطريق ضمن العملة الحالية.
- حتى 500 رحلة ومفضلة؛ سجل شهري ورسم لستة أشهر مع فصل العملات. **السجل لتقديرات محفوظة وليس لمدفوعات فعلية.** لا تُحذف رحلات تلقائياً عند امتلائه.
- المفضلة تعيد حساب المسافة بسعر الوقود والسيارة الحاليين. عند اختلاف عملة الرحلة المحفوظة، تُصفّر إضافاتها.
- مشاركة ملخص نصي أو نسخه، CSV للفترة والعملة المختارتين، وJSON للنسخ الاحتياطي مع معاينة وتأكيد قبل الاستبدال.
- الحاسبة والسيارات والسجل تعمل دون إنترنت بعد أول تحميل ناجح. مسودة الجلسة تبقى خلال إعادة التحميل والتحديث المقبول.

## الحسابات

```text
المسافة الكلية = مسافة الاتجاه الواحد × (2 للعودة، وإلا 1)
اللترات = المسافة الكلية ÷ الكفاءة بكم/لتر
تكلفة الوقود = اللترات × سعر اللتر
الاحتياط = تكلفة الوقود × نسبة الاحتياط ÷ 100
الميزانية = تكلفة الوقود + الاحتياط + المصاريف الإضافية
حصة الشخص = الميزانية ÷ عدد المشاركين
```

لا تُقرّب النتائج الوسيطة للحساب اليدوي؛ التقريب للعرض فقط. تُنقل مسافة OSRM إلى الحاسبة بمنزلتين عشريتين. الصفر سعر صالح، والسعر الفارغ لا ينتج تكلفة مكتملة. يدعم الأرقام العربية والفارسية والإنجليزية والفواصل العشرية وفواصل الآلاف. الاستهلاك مُدخل من المستخدم وليس قياساً فعلياً من السيارة.

العودة تضاعف مسافة الذهاب ولا تعيد توجيه طريق العودة؛ قد يختلف فعلياً. مدة القيادة بلا مرور مباشر. لا يتحقق التطبيق من فتح الطرق أو ظروفها ولا يحسب الصيانة أو استهلاك السيارة تلقائياً. لا تُعرض المسافات اليدوية كطريق محسوب ولا يتحول فشل التوجيه إلى تقدير بخط مستقيم.

## البيانات والخصوصية

لا خادم أو حساب أو تحليلات. `road-cost-v4` يحتوي الإعدادات والسيارات والتقديرات. تُنسخ إعدادات `taxi-fuel-offline-v1` بأمان، ويستمر تحديث المفتاح القديم للتوافق. يحتفظ `road-cost-last-route-summary-v1` بالمسافة والمدة السابقة للعرض فقط. الإحداثيات وGPS تبقى بالذاكرة ولا تُحفظ في السجل أو النسخة الاحتياطية؛ أسماء الرحلات التي تكتبها تُحفظ بطلبك.

مسودة `sessionStorage` ليست بديلاً عن حفظ الرحلة. عند تعذر التخزين يظهر تحذير ولا يُعلن نجاح حفظ رحلة أو سيارة فشل حفظها. عند اكتشاف بيانات تالفة تُحاول كتابة نسخة خام في `road-cost-recovery-v4` ثم استعادة الإعدادات القديمة المتاحة. صدّر JSON قبل مسح بيانات المتصفح أو تغيير الجهاز. الملفات التي تصدّرها أو تشاركها قد تحتوي أسماء رحلاتك.

يُتحقق JSON قبل الاستعادة؛ يُرفض ملف يتضمن سجلات غير صالحة أو يتجاوز 2MB. الحد 20 سيارة و500 رحلة. تُعرض الأسماء كنصوص آمنة، وتحمي خلايا CSV من بادئات صيغ الجداول.

## الخرائط

Leaflet 1.9.4 محلي مع رخصته. تُحمّل مربعات [OpenStreetMap](https://www.openstreetmap.org/copyright) الظاهرة فقط. البحث إلى Nominatim / Photon عند ضغط بحث أو Enter فقط؛ يختار المستخدم النتيجة صراحةً. تُرسل النقطتان إلى [OSRM](https://project-osrm.org/) عند طلب الطريق. لا GPS دون ضغط زر الموقع.

- [Nominatim](https://operations.osmfoundation.org/policies/nominatim/): لا إكمال تلقائي، تعريف عبر Referer، إسناد، وطلب واحد بالثانية **للتطبيق ككل**. المهلة والكاش وتسلسل الطلبات داخل الصفحة **لا تفرض حداً عالمياً على كل الأجهزة**. الاستخدام العام منخفض الحجم فقط؛ قبل التوسع يلزم مزود مخصص أو استضافة ذاتية أو proxy بحد مركزي. نقاط تغيير المزود في `CONFIG` أعلى `map.js`.
- [Photon demo](https://github.com/komoot/photon#demo-server) و[OSRM demo](https://github.com/Project-OSRM/osrm-backend/wiki/Api-usage-policy) بلا ضمان توفر. يستخدم Photon `lang=default` لأن `lang=ar` غير مدعوم بالخدمة العامة.
- [سياسة مربعات OSM](https://operations.osmfoundation.org/policies/tiles/): إسناد ظاهر، Referer متاح، واحترام كاش المتصفح. لا تنزيل جماعي ولا تخزين خارجي في Service Worker.

تظهر 403/429/5xx والمهلة للمستخدم وتبقى الحاسبة اليدوية متاحة. نجاح الفحص الحي لا يضمن الوصول من كل الشبكات. لا مفاتيح سرية أو اشتراكات أو تكاليف تشغيل أُضيفت.

## التثبيت والتحديث

**iPhone/iPad:** Safari ← مشاركة ← إضافة إلى الشاشة الرئيسية. **Android/Chrome:** قائمة المتصفح ← تثبيت التطبيق، أو زر التثبيت حين يتيحه المتصفح. افتحه مرة متصلاً ثم جرّب وضع الطيران. الخرائط والمسارات الجديدة تحتاج إنترنت.

يُخزن كاش محدود لملفات التطبيق المحلية دون تراكم `?fresh=` أو API responses. لا تُفعّل نسخة جزئية. التحديث ينتظر قبولك، ثم يحتفظ بالمسودة ويعيد التحميل. تُحذف كاشات Road Cost القديمة فقط. **غيّر رقم الكاش وإصدارات الملفات معاً عند الإصدار القادم.** لا تحذف بيانات الموقع من أجل التحديث.

WebKit يحاكي محرك Safari؛ **لم يُختبر على iPhone فعلي**.

## Development / verification

No runtime npm dependency, framework, build step or backend. GitHub Pages serves the repository root on `main` at the original URL. Node 22+ for development/CI.

```sh
npm ci
npm start                          # http://127.0.0.1:8765
npm run check                      # syntax
npm test                           # arithmetic, migration, cache policy, map regression
npx playwright install chromium webkit
npm run test:e2e                   # desktop/mobile Chromium, mobile WebKit
npm run test:live                  # real upstream requests, separate from mocks
npm run test:deployed              # live Pages SHA-256 equality after deployment
```

If downloaded Chromium cannot launch on Windows, use installed Chrome:

```powershell
$env:PLAYWRIGHT_BROWSER_CHANNEL = 'chrome'
npm run test:e2e -- --project=chromium-desktop --project=chromium-mobile
```

`core.js`: pure calculations/schema. `app.js`: UI/storage/updates. `map.js`: geocoding independent from routing. `sw.js`: explicit app shell. Browser tests serve real local Leaflet and mock external APIs/GPS. Chromium separately tests an actual worker, offline reload and HTTP-served update lifecycle. WebKit does not pretend to cover a physical iPhone or the Chromium worker.

CI runs deterministic checks and browser journeys, uploads reports, reports upstream availability separately, and compares deployed public bytes to the commit. Deployment is not inferred from a test pass. Local screenshots in ignored `output/playwright/`; browser reports/results also ignored.

Alexandria font: SIL OFL (`fonts/OFL.txt`). Leaflet: BSD-2-Clause (`vendor/LEAFLET-LICENSE.txt`).
