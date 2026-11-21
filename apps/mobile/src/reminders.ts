// "Your streak is about to break" reminder: one local notification, rescheduled whenever the app
// goes to the background (so logging a workout cancels or moves it).

import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { streakReminder } from '@open-workouts/shared';
import { store } from './state';

const ID = 'streak-reminder';
const CHANNEL = 'reminders';

/** Asks for notification permission (only when the person turns reminders on). */
export async function allowReminders(): Promise<boolean> {
  try {
    if (Platform.OS === 'android')
      await Notifications.setNotificationChannelAsync(CHANNEL, {
        name: 'Reminders',
        description: 'Tells you when your weekly streak is about to break',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    const p = await Notifications.getPermissionsAsync();
    if (p.granted) return true;
    return p.canAskAgain ? (await Notifications.requestPermissionsAsync()).granted : false;
  } catch {
    return false;
  }
}

async function reschedule(enabled: boolean, goal: number) {
  try {
    await Notifications.cancelScheduledNotificationAsync(ID).catch(() => {});
    if (!enabled) return;
    // Never prompt from here: without permission (asked by the rest timer or the setting) skip it.
    if (!(await Notifications.getPermissionsAsync()).granted) return;
    const plan = streakReminder(store.dataset, goal);
    if (!plan) return;
    if (Platform.OS === 'android') await allowReminders(); // makes sure the channel exists
    await Notifications.scheduleNotificationAsync({
      identifier: ID,
      content: { title: plan.title, body: plan.body, data: { kind: 'streak' } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: plan.at, channelId: CHANNEL },
    });
  } catch (e) {
    console.warn('Could not schedule the streak reminder', e);
  }
}

/** Keeps the streak reminder up to date while the app runs. */
export function useStreakReminder(enabled: boolean, goal: number) {
  useEffect(() => {
    void reschedule(enabled, goal);
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'background') void reschedule(enabled, goal);
    });
    return () => sub.remove();
  }, [enabled, goal]);
}
