# Google rating setup — VINAYAK

Gallery aur Google Maps reviews link ready hain. Website par automatic numeric stars dikhane ke liye yeh setup karein. Abhi koi star number hardcode nahi kiya gaya hai.

1. [Google Cloud Console](https://console.cloud.google.com/) kholein aur ek project create/select karein.
2. Project par billing account configure karein aur **Places API (New)** enable karein. API usage ke charges ho sakte hain; Google Cloud mein quotas aur billing controls review karein.
3. **APIs & Services → Credentials → Create credentials → API key** se key banayein. Key ki API restriction **Places API (New)** par set karein. Production mein apne server ke supported application/IP restrictions bhi configure karein.
4. Key ko chat, screenshots ya public GitHub code mein share na karein. Is project ke `.env.example` ki copy `.env` banayein, aur private file mein `GOOGLE_PLACES_API_KEY` ki blank value ko apni key se replace karein. Hosted website par hosting provider ke secret settings use kar sakte hain. `.env` source control aur deployment ZIP se excluded hai.
5. Existing local server ko stop karke `npm start` chalayein. Google key `.env` se load hogi. Agar preview Codex ne start kiya hai, key private file mein save karne ke baad chat mein sirf **“key configure kar di”** likhein; key khud na bhejein.

Connector pehle supplied salon listing ka exact Google CID match karke Place ID find karne ki koshish karega. Agar Google search response exact match nahi deta, Google ke official Place ID Finder se salon ka Place ID lekar private configuration mein `GOOGLE_PLACE_ID` set karein aur restart karein.

Phir homepage aur gallery ke Google section mein asli rating aur rating count dikh sakta hai. Page load par aur visible rehne par har 5 minute live request hoti hai. Missing key, wrong key, API restriction, quota error ya lookup failure par score hidden rahega; Read Google reviews link phir bhi kaam karega. Google apni rating update timing control karta hai.

Website `/site-info.html` par privacy aur site information provide karti hai. Business owner ko public launch se pehle apne actual business practices ke against is information ko review karna chahiye.

Official reference: [Places API setup](https://developers.google.com/maps/documentation/places/web-service/get-api-key).
