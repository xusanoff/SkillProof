---
name: ui-motion
description: Animatsiya qoidalari, mikro-animatsiyalar va ishlash cheklovlari (Motion, transform/opacity, reduced motion). Job board, nomzod kabineti, HR dashboard yoki interview ekranlarida har qanday animatsiya, o'tish yoki scroll effekti bilan ishlaganda ishlat. Doim yuklanadi.
---

# UI Motion (SkillProof)

Kutubxona: **Motion** (`motion` paketi, import `motion/react`). Umumiy animatsiya kodi `frontend/src/components/motion/` da; sahifalar uni faqat import qiladi.

## 1. Qayerda nima
```
src/components/motion/
  variants.ts        fadeUp, scaleIn, stagger (manba haqiqat)
  MotionProvider.tsx LazyMotion + MotionConfig reducedMotion="user"
  FadeIn.tsx         bo'lim paydo bo'lishi (whileInView, once)
  PressScale.tsx     tugma/kartochka bosilganda scale 0.97
```

## 2. Qayerda animatsiya mumkin
| joy | ruxsat |
|---|---|
| Job board, kompaniya sahifasi | bo'limlar `fadeUp`, vakansiya kartochkalari qator bo'yicha `stagger` |
| HR dashboard | ro'yxat filtr o'zgarganda opacity; replay player taymlayni |
| **Interview xonasi** | faqat holat signallari: inactivity ogohlantirishi (opacity + kichik scale), AI gapirayotgani indikatori. Boshqa hech narsa. |

Davomiylik 0.2–0.45s, easing `[0.22, 1, 0.36, 1]`. Stagger kechikishi qator ichidagi indeks bo'yicha (`(index % columns) * 0.06`).

## 3. Majburiy qoidalar
1. Faqat `transform` (`x`, `y`, `scale`, `rotate`) va `opacity`. `width`, `height`, `top`, `margin`, `box-shadow`, `filter` animatsiya qilinmaydi.
2. Scroll orqali paydo bo'lish: `whileInView` + `viewport={{ once: true, amount: 0.2 }}`.
3. Bundle: `LazyMotion` + `domAnimation` + `m.*` (`motion.*` emas).
4. `prefers-reduced-motion`: animatsiya o'chadi yoki faqat opacity qoladi (`<MotionConfig reducedMotion="user">`).
5. Server komponentlarda Motion yo'q — animatsiyali qism alohida `'use client'` komponent.
6. `will-change` doimiy qo'yilmaydi.

```tsx
// ❌ layout xususiyati, har scroll'da qayta, to'liq bundle
import { motion } from 'motion/react';
<motion.div initial={{ height: 0 }} whileInView={{ height: 'auto' }} viewport={{ once: false }} />
// ✅
import { m } from 'motion/react';
<m.div variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.2 }} custom={index} />
```

## 4. Mikro-animatsiyalar
- **PressScale**: `whileTap={{ scale: 0.97 }}`.
- **Skeleton**: opacity pulse; kontent kelgach `opacity 0→1`.
- **Inactivity warning** (60s): banner `opacity`+`y` bilan kiradi, countdown raqami `tabular-nums` (kenglik sakramasin).
- **Sahifa o'tishi**: kerak bo'lsa faqat opacity, 0.2s.

## 5. Tekshirish
- DevTools → Rendering → "Emulate prefers-reduced-motion".
- Performance (CPU 4x): ro'yxat scroll'da "Layout" bloklari yo'q.
