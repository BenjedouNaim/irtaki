/**
 * Arabic copy for the DEC-D03 notification catalogue (SAS §22.2 N-01…N-08),
 * taken from the SCR-35 Figma frame (43:126).
 *
 * The API ships each row's `description` from `notification_categories`
 * (DBT-15), but that column is one line of deployment reference data while
 * SCR-35's row is a title AND a description — and the UI is Arabic
 * throughout (UF §33). The codes are the stable contract (AGENTS §13: "any
 * notification beyond the 8 named events" is out of scope), so the screen
 * keys its copy off `category` and falls back to the server's `description`
 * for anything it does not recognise.
 */
export interface NotificationCategoryCopy {
  title: string;
  subtitle: string;
}

export const NOTIFICATION_CATEGORY_COPY: Record<
  string,
  NotificationCategoryCopy
> = {
  'N-01': {
    title: 'تذكير التقرير اليومي',
    subtitle: 'إشعار مسائي إن لم تُرسل تقرير اليوم',
  },
  'N-02': {
    title: 'التقرير الأسبوعي متاح',
    subtitle: 'صباح يوم التسميع',
  },
  'N-03': {
    title: 'قبول طلب الانضمام',
    subtitle: 'دائمًا',
  },
  'N-04': {
    title: 'رفض طلب الانضمام',
    subtitle: 'دائمًا',
  },
  'N-05': {
    title: 'طلب انضمام جديد',
    subtitle: 'للمساعد — عند وصول طلب لمجموعتك',
  },
  'N-06': {
    // Figma's subtitle reads "بثلاثة أيام"; BR-33 puts the cycle in
    // `Due Soon` for its final TEN days, and the docs decide behaviour.
    title: 'استحقاق الدفع',
    subtitle: 'خلال آخر عشرة أيام من دورة الدفع',
  },
  'N-07': {
    title: 'طالب معرّض للخطر',
    subtitle: 'للمعلّم — عند دخول طالب قائمة الخطر',
  },
  'N-08': {
    title: 'الإزالة من المجموعة',
    subtitle: 'دائمًا',
  },
};

/** The SCR-35 row copy for one category, falling back to the API's own text. */
export function categoryCopy(
  category: string,
  description: string,
): NotificationCategoryCopy {
  return (
    NOTIFICATION_CATEGORY_COPY[category] ?? {
      title: description,
      subtitle: '',
    }
  );
}
