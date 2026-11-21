import { useMemo, useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import {
  BUILTIN_EXERCISES,
  MEASUREMENT_KINDS,
  exportStrongCsv,
  fromKg,
  importStrongCsv,
  looksLikeBackup,
  parseBackup,
  toKg,
  workoutsPerWeek,
  type MeasurementKind,
} from '@open-workouts/shared';
import { usePrefs, useStore, type Account, type Prefs } from '../state';
import { Button, Card, Chips, Eyebrow, H2, IconButton, NumInput, Screen, Segmented, T, formatDate, label, styles, useTheme, type IconName } from '../ui';
import { AppearanceCard } from './Appearance';
import { useDialog } from '../dialog';

export function ProfileScreen({ account }: { account: Account }) {
  const store = useStore();
  const prefs = usePrefs();
  const t = useTheme();
  const weeks = useMemo(() => workoutsPerWeek(store.dataset, 12), [store.dataset]);
  const max = Math.max(1, ...weeks.map((w) => w.count));
  const finished = store.all('workouts').filter((w) => w.endedAt != null);
  const total = finished.length;
  const thisWeek = weeks[weeks.length - 1]?.count ?? 0;
  const avg = weeks.length ? weeks.reduce((n, w) => n + w.count, 0) / weeks.length : 0;
  // Consecutive weeks (ending this week or last week) with at least one workout.
  let streak = 0;
  for (let i = weeks.length - 1 - (thisWeek ? 0 : 1); i >= 0 && weeks[i]!.count > 0; i--) streak++;
  return (
    <Screen title={account.server?.username ?? 'Profile'} subtitle={account.server ? 'Synced with your server' : 'Local-only mode'}>
      <View style={[styles.row, { gap: 10, marginTop: 4 }]}>
        <StatTile icon="barbell" value={String(total)} caption="Workouts" />
        <StatTile icon="flame" value={String(streak)} caption={`Week streak`} />
        <StatTile icon="calendar" value={String(thisWeek)} caption="This week" />
      </View>
      <Card>
        <View style={styles.rowBetween}>
          <T bold style={{ fontSize: 16 }}>
            Workouts per week
          </T>
          <T small muted>
            avg {avg.toFixed(1)}
          </T>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 120, gap: 6, marginTop: 14 }}>
          {weeks.map((w, i) => (
            <View
              key={w.weekStart}
              style={{
                flex: 1,
                height: `${(w.count / max) * 100}%`,
                minHeight: 6,
                borderRadius: 6,
                backgroundColor: i === weeks.length - 1 ? t.accent : w.count ? t.accentSoft : t.surface2,
              }}
            />
          ))}
        </View>
        <View style={[styles.rowBetween, { marginTop: 6 }]}>
          <T small muted>
            {weeks.length} weeks ago
          </T>
          <T small muted>
            This week
          </T>
        </View>
      </Card>
      <Measurements prefs={prefs} />
    </Screen>
  );
}

function Measurements({ prefs }: { prefs: Prefs }) {
  const store = useStore();
  const dialog = useDialog();
  const [kind, setKind] = useState<MeasurementKind>('body_weight');
  const [value, setValue] = useState<number | null>(null);
  const unit = kind === 'body_weight' ? prefs.weightUnit : kind === 'body_fat' ? '%' : kind === 'caloric_intake' ? 'kcal' : 'cm';
  const list = store
    .all('measurements')
    .filter((m) => m.kind === kind)
    .sort((a, b) => b.takenAt - a.takenAt);
  const show = (v: number) => (kind === 'body_weight' ? +fromKg(v, prefs.weightUnit).toFixed(2) : v);
  return (
    <View>
      <H2>Measurements</H2>
      <Chips options={MEASUREMENT_KINDS.map((k) => ({ value: k, label: label(k) }))} value={kind} onChange={setKind} />
      <Card>
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <NumInput value={value} onChange={setValue} placeholder={`New ${label(kind).toLowerCase()}`} accessibilityLabel={`New ${label(kind)} value in ${unit}`} />
        </View>
        <T muted>{unit}</T>
        <Button
          title="Add"
          icon="add"
          small
          variant="primary"
          disabled={value == null}
          onPress={() => {
            store.insert('measurements', { kind, value: kind === 'body_weight' ? toKg(value!, prefs.weightUnit) : value!, takenAt: Date.now(), note: null });
            setValue(null);
          }}
        />
      </View>
      {list.length === 0 && (
        <T small muted style={{ marginTop: 8 }}>
          Nothing logged yet.
        </T>
      )}
      {list.slice(0, 20).map((m) => (
        <View key={m.id} style={[styles.rowBetween, { paddingVertical: 4 }]}>
          <T bold style={{ fontVariant: ['tabular-nums'] }}>
            {show(m.value)} {unit}
          </T>
          <T small muted>
            {formatDate(m.takenAt)}
          </T>
          <IconButton
            name="trash-outline"
            label={`Delete ${show(m.value)} ${unit}`}
            onPress={() => {
              // Delete straight away, with Undo, rather than asking first.
              store.remove('measurements', m.id);
              dialog.toast(`Deleted ${show(m.value)} ${unit}`, {
                text: 'Undo',
                onPress: () => store.insert('measurements', { kind: m.kind, value: m.value, takenAt: m.takenAt, note: m.note }),
              });
            }}
          />
        </View>
      ))}
      </Card>
    </View>
  );
}

export function SettingsScreen({ account, onSignOut }: { account: Account; onSignOut: () => void }) {
  const store = useStore();
  const prefs = usePrefs();
  const dialog = useDialog();
  const t = useTheme();
  const setPref =(p: Partial<Prefs>) => store.setSetting('prefs', { ...prefs, ...p });
  const [importing, setImporting] = useState(false);
  const [importUnit, setImportUnit] = useState<'kg' | 'lb'>(prefs.weightUnit);

  const [exporting, setExporting] = useState<'csv' | 'json' | null>(null);
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

  async function importFile() {
    const res = await DocumentPicker.getDocumentAsync({
      type: ['text/csv', 'text/comma-separated-values', 'application/json', 'text/plain', '*/*'],
      copyToCacheDirectory: true,
    });
    if (res.canceled || !res.assets?.[0]) return;
    setImporting(true);
    try {
      // Parsed on-device so it also works in local-only mode; synced afterwards.
      const text = await new File(res.assets[0].uri).text();
      if (looksLikeBackup(text)) {
        const s = store.restoreBackup(parseBackup(text));
        void store.sync().catch(() => {});
        const changed = s.added + s.restored + s.updated;
        void dialog.alert(
          changed ? 'Backup restored' : 'Already up to date',
          changed
            ? `Restored ${plural(s.workouts, 'workout')} and ${plural(s.templates, 'template')} (${plural(changed, 'item')} in total).`
            : 'Everything in this backup is already on this device.',
        );
        return;
      }
      const r = importStrongCsv(text, {
        weightUnit: importUnit,
        distanceUnit: prefs.distanceUnit,
        existingExercises: store.all('exercises'),
        existingWorkouts: store.all('workouts'),
      });
      store.applyRemote(r.changes, true);
      void store.sync().catch(() => {});
      const n = r.summary.newExercises.length;
      const dup = r.summary.alreadyLogged;
      void dialog.alert(
        r.summary.workouts ? 'Import complete' : 'Nothing new to import',
        r.summary.workouts
          ? `${plural(r.summary.workouts, 'workout')} and ${plural(r.summary.sets, 'set')} imported${n ? `, plus ${plural(n, 'new exercise')}` : ''}.${dup ? ` Skipped ${plural(dup, 'workout')} you already have.` : ''}`
          : dup
            ? dup === 1
              ? 'The workout in this file is already logged.'
              : `All ${dup} workouts in this file are already logged.`
            : 'No workouts found in this file.',
      );
    } catch (e) {
      void dialog.alert(
        'Import failed',
        `${(e as Error).message}

Pick a Strong CSV export, a CSV exported from Open Workouts, or an Open Workouts backup (.json).`,
      );
    } finally {
      setImporting(false);
    }
  }

  async function exportFile(kind: 'csv' | 'json') {
    if (!(await Sharing.isAvailableAsync())) {
      void dialog.alert('Export unavailable', 'Sharing files is not supported on this device.');
      return;
    }
    setExporting(kind);
    try {
      const date = new Date().toISOString().slice(0, 10);
      let text: string;
      if (kind === 'json') text = JSON.stringify(store.backup());
      else {
        const names = new Map([...BUILTIN_EXERCISES, ...store.all('exercises')].map((e) => [e.id, e.name]));
        text = exportStrongCsv(
          {
            workouts: store.all('workouts'),
            workoutExercises: store.all('workoutExercises'),
            sets: store.all('sets'),
            exerciseName: (id) => names.get(id) ?? id,
          },
          { weightUnit: prefs.weightUnit, distanceUnit: prefs.distanceUnit },
        );
      }
      const file = new File(Paths.cache, `open-workouts-${kind === 'json' ? 'backup-' : ''}${date}.${kind}`);
      if (file.exists) file.delete();
      file.create();
      await file.write(text);
      await Sharing.shareAsync(file.uri, {
        mimeType: kind === 'json' ? 'application/json' : 'text/csv',
        UTI: kind === 'json' ? 'public.json' : 'public.comma-separated-values-text',
        dialogTitle: kind === 'json' ? 'Save backup' : 'Export workouts',
      });
    } catch (e) {
      void dialog.alert('Export failed', (e as Error).message);
    } finally {
      setExporting(null);
    }
  }

  return (
    <Screen title="Settings">
      <Eyebrow>Appearance</Eyebrow>
      <AppearanceCard />

      <Eyebrow style={{ marginTop: 18 }}>Training</Eyebrow>
      <Card>
        <View style={local.setting}>
          <T style={{ flex: 1 }}>Weight</T>
          <View style={{ width: 130 }}>
            <Segmented options={[{ value: 'kg' as const, label: 'kg' }, { value: 'lb' as const, label: 'lb' }]} value={prefs.weightUnit} onChange={(v) => setPref({ weightUnit: v })} />
          </View>
        </View>
        <View style={local.setting}>
          <T style={{ flex: 1 }}>Distance</T>
          <View style={{ width: 130 }}>
            <Segmented options={[{ value: 'km' as const, label: 'km' }, { value: 'mi' as const, label: 'mi' }]} value={prefs.distanceUnit} onChange={(v) => setPref({ distanceUnit: v })} />
          </View>
        </View>
        <View style={local.setting}>
          <T style={{ flex: 1 }}>Rest timer (seconds)</T>
          <NumInput value={prefs.restSeconds} onChange={(v) => setPref({ restSeconds: v ?? 0 })} style={{ width: 90 }} accessibilityLabel="Default rest timer in seconds" />
        </View>
        <View style={[local.setting, { marginBottom: 0 }]}>
          <T style={{ flex: 1 }}>Bar weight ({prefs.weightUnit})</T>
          <NumInput
            value={+fromKg(prefs.barWeightKg, prefs.weightUnit).toFixed(2)}
            onChange={(v) => setPref({ barWeightKg: toKg(v ?? 0, prefs.weightUnit) })}
            style={{ width: 90 }}
            accessibilityLabel={`Bar weight in ${prefs.weightUnit}`}
          />
        </View>
      </Card>

      <Eyebrow style={{ marginTop: 18 }}>Your data</Eyebrow>
      <Card>
        <T bold style={{ fontSize: 16 }}>Export</T>
        <T small muted style={{ marginTop: 2, marginBottom: 8 }}>
          The backup has everything: workouts, templates, measurements and settings. Restore it here or on another device. The CSV has
          your workouts in Strong's format, for spreadsheets and other apps.
        </T>
        <Button variant="primary" icon="cloud-download-outline" title={exporting === 'json' ? 'Preparing…' : 'Save full backup (.json)'} disabled={!!exporting} onPress={() => void exportFile('json')} />
        <Button icon="document-text-outline" title={exporting === 'csv' ? 'Preparing…' : 'Export workouts (.csv)'} disabled={!!exporting} onPress={() => void exportFile('csv')} />
      </Card>
      <Card>
        <T bold style={{ fontSize: 16 }}>Import</T>
        <T small muted style={{ marginTop: 2 }}>
          Restore a backup, or import a CSV from this app or from Strong (Settings → Export Strong Data). Workouts you already have are
          skipped, so importing the same file twice is safe.
        </T>
        <View style={[local.setting, { marginTop: 10 }]}>
          <T small muted style={{ flex: 1 }}>
            Strong files with no unit in the header are in
          </T>
          <View style={{ width: 110 }}>
            <Segmented options={[{ value: 'kg' as const, label: 'kg' }, { value: 'lb' as const, label: 'lb' }]} value={importUnit} onChange={setImportUnit} />
          </View>
        </View>
        <Button variant="soft" icon="folder-open-outline" title={importing ? 'Importing…' : 'Choose file'} disabled={importing} onPress={importFile} />
      </Card>

      <Eyebrow style={{ marginTop: 18 }}>Account</Eyebrow>
      <Card>
        <T bold style={{ fontSize: 16 }}>Sync</T>
        {account.server ? (
          <>
            <T small muted>
              {account.server.username} @ {account.server.baseUrl}
            </T>
            <T small muted>
              {store.pendingCount()} pending · last sync {store.lastSyncAt ? new Date(store.lastSyncAt).toLocaleTimeString() : 'never'}
            </T>
            {store.lastSyncError && (
              <T small style={{ color: t.danger }}>
                {store.lastSyncError}
              </T>
            )}
            <Button
              title="Sync now"
              icon="sync"
              variant="soft"
              style={{ marginTop: 8 }}
              onPress={() =>
                void store
                  .sync()
                  .then(() => dialog.toast('Synced'))
                  .catch((e: Error) => dialog.toast(`Sync failed: ${e.message}`))
              }
            />
          </>
        ) : (
          <T small muted>
            Local-only mode. Sign out and connect a server to sync and back up your data.
          </T>
        )}
      </Card>
      <Card>
        <T bold style={{ fontSize: 16 }}>About & license</T>
        <T small muted>
          Open Workouts is source-available under the PolyForm Noncommercial License 1.0.0: free for non-commercial use, changes and sharing;
          commercial use needs a separate license. Built with open-source libraries.
        </T>
        <View style={styles.row}>
          <Button small variant="ghost" title="License" onPress={() => void Linking.openURL('https://polyformproject.org/licenses/noncommercial/1.0.0')} />
          {account.server && (
            <Button small variant="ghost" title="Third-party notices" onPress={() => void Linking.openURL(`${account.server!.baseUrl}/third-party-notices.txt`)} />
          )}
        </View>
      </Card>
      <Button
        title={account.server ? 'Sign out' : 'Connect a server'}
        variant="danger"
        onPress={async () => {
          const pending = store.pendingCount();
          const ok = await dialog.confirm({
            title: account.server ? 'Sign out?' : 'Leave local mode?',
            message: account.server
              ? pending
                ? `${pending} change${pending === 1 ? '' : 's'} have not synced yet and will be lost. Tap Sync now first if you can.`
                : 'Your data stays on the server.'
              : 'Local data stays on this device and comes back if you choose local mode again.',
            confirmText: account.server ? 'Sign out' : 'Continue',
            destructive: !!(account.server && pending),
          });
          if (ok) onSignOut();
        }}
      />
    </Screen>
  );
}

function StatTile({ icon, value, caption }: { icon: IconName; value: string; caption: string }) {
  const t = useTheme();
  return (
    <View style={[local.tile, { backgroundColor: t.surface, borderColor: t.border, borderWidth: t.dark ? StyleSheet.hairlineWidth : 0 }]}>
      <View style={[local.tileIcon, { backgroundColor: t.accentSoft }]}>
        <Ionicons name={icon} size={16} color={t.accentText} />
      </View>
      <Text style={{ color: t.text, fontSize: 24, fontWeight: '800', letterSpacing: -0.5, marginTop: 10 }}>{value}</Text>
      <Text style={{ color: t.muted, fontSize: 12, fontWeight: '600' }} numberOfLines={1}>
        {caption}
      </Text>
    </View>
  );
}

const local = StyleSheet.create({
  tile: { flex: 1, borderRadius: 20, padding: 14 },
  tileIcon: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  setting: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
});
