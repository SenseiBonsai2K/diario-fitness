// Which diet day ("giornata") is eaten on a date. The active diet maps each
// weekday to a day type; a single date can take another day's menu instead,
// recorded in the day log as days[date].menu = "<dayId>". Only that date
// changes, never the diet's weekly scheme.

import { parseIso } from "./dates.js";

export function activeDiet(data) {
  return data.diets[data.activeDiet] || null;
}

/** The day type the diet's weekly scheme puts on a date (or the only one), else null. */
export function schemeDietDayId(data, date) {
  const diet = activeDiet(data);
  if (!diet) return null;
  const id = diet.week?.[String(parseIso(date).getDay())];
  if (id && diet.days.some((d) => d.id === id)) return id;
  return diet.days.length === 1 ? diet.days[0].id : null;
}

/** The day type eaten on a date: a menu change wins over the weekly scheme. */
export function dietDayIdOn(data, date) {
  const diet = activeDiet(data);
  const own = data.days?.[date]?.menu;
  if (own && diet?.days.some((d) => d.id === own)) return own;
  return schemeDietDayId(data, date);
}

export function dietDayOn(data, date) {
  const id = dietDayIdOn(data, date);
  return activeDiet(data)?.days.find((d) => d.id === id) || null;
}

/** True when the menu of a date differs from the weekly scheme. */
export function menuChanged(data, date) {
  return dietDayIdOn(data, date) !== schemeDietDayId(data, date);
}

// The value to store in days[date].menu: nothing when it matches the scheme again.
const menuValue = (data, date, id) => (id === schemeDietDayId(data, date) ? null : id);

/**
 * The days[*].menu values that give `date` the menu of `other`. With swap,
 * `other` takes the menu of `date` in return; otherwise `other` keeps its own
 * (the same menu on two days).
 */
export function menuEntries(data, date, other, swap) {
  const mine = dietDayIdOn(data, date);
  const theirs = dietDayIdOn(data, other);
  const out = { [date]: menuValue(data, date, theirs) };
  if (swap) out[other] = menuValue(data, other, mine);
  return out;
}
