import { getEnv } from "@/lib/env";
import { todayIn, type CivilDate } from "@/lib/timezone/civil-date";

/** Data odierna nel fuso dell'applicazione (default Europe/Rome). */
export function appToday(): CivilDate {
  return todayIn(getEnv().APP_TIMEZONE);
}
