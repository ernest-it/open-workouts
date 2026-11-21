import { useMemo, useState } from 'react';
import { Linking, View } from 'react-native';
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
import { Button, Card, Chips, H2, IconButton, NumInput, Screen, T, formatDate, label, styles, useTheme } from '../ui';
import { useDialog } from '../dialog';

export function ProfileScreen({ account }: { account: Account }) {
  const store = useStore();
  const prefs = usePrefs();
  const t = useTheme();
  const weeks = useMemo(() => workoutsPerWeek(store.dataset, 12), [store.dataset]);
  const max = Math.max(1, ...weeks.map((w) => w.count));
  const total = store.all('workouts').filter((w) => w.endedAt != null).length;
  return (
    <Screen title={account.server?.username ?? 'Profile'}>
      <T muted>
        {total} workout{total === 1 ? '' : 's'}
      </T>
      <Card>
        <T bold>Workouts per week</T>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 110, gap: 4, marginTop: 8 }}>
          {weeks.map((w) => (
            <View key={w.weekStart} style={{ flex: 1, height: `${(w.count / max) * 100}%`, minHeight: 2, backgroundColor: t.accent, borderTopLeftRadius: 3, borderTopRightRadius: 3 }} />
          ))}
        </View>
        <View style={[styles.rowBetween, { marginTop: 4 }]}>
          <T small muted>
            {weeks.length} weeks ago
          </T>
          <T small muted>
            This week: {weeks[weeks.length - 1]?.count ?? 0}
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
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <NumInput value={value} onChange={setValue} placeholder={`New ${label(kind).toLowerCase()}`} accessibilityLabel={`New ${label(kind)} value in ${unit}`} />
        </View>
        <T muted>{unit}</T>
        <Button
          title="Add"
          variant="primary"
          disabled={value == null}
          onPress={() => {
            store.insert('measurements', { kind, value: kind === 'body_weight' ? toKg(value!, prefs.weightUnit) : value!, takenAt: Date.now(), note: null });
            setValue(null);
          }}
        />
      </View>
      {list.slice(0, 20).map((m) => (
        <View key={m.id} style={[styles.rowBetween, { paddingVertical: 6 }]}>
          <T>
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
    </View>
  );
}

export function SettingsScreen({ account, onSignOut }: { account: Account; onSignOut: () => void }) {
  const store = useStore();
  const prefs = usePrefs();
  const dialog = useDialog();
  const setPref = (p: Partial<Prefs>) => store.setSetting('prefs', { ...prefs, ...p });
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
      <Card>
        <T bold>Units</T>
        <View style={styles.rowBetween}>
          <T muted>Weight</T>
          <Chips options={[{ value: 'kg' as const, label: 'kg' }, { value: 'lb' as const, label: 'lb' }]} value={prefs.weightUnit} onChange={(v) => setPref({ weightUnit: v })} />
        </View>
        <View style={styles.rowBetween}>
          <T muted>Distance</T>
          <Chips options={[{ value: 'km' as const, label: 'km' }, { value: 'mi' as const, label: 'mi' }]} value={prefs.distanceUnit} onChange={(v) => setPref({ distanceUnit: v })} />
        </View>
        <T muted>Default rest timer (seconds)</T>
        <NumInput value={prefs.restSeconds} onChange={(v) => setPref({ restSeconds: v ?? 0 })} />
        <T muted>Bar weight ({prefs.weightUnit})</T>
        <NumInput value={+fromKg(prefs.barWeightKg, prefs.weightUnit).toFixed(2)} onChange={(v) => setPref({ barWeightKg: toKg(v ?? 0, prefs.weightUnit) })} />
      </Card>
      <Card>
        <T bold>Export</T>
        <T small muted>
          The backup has everything: workouts, templates, measurements and settings. Restore it here or on another device. The CSV has
          your workouts in Strong's format, for spreadsheets and other apps.
        </T>
        <Button variant="primary" title={exporting === 'json' ? 'Preparing…' : 'Save full backup (.json)'} disabled={!!exporting} onPress={() => void exportFile('json')} />
        <Button title={exporting === 'csv' ? 'Preparing…' : 'Export workouts (.csv)'} disabled={!!exporting} onPress={() => void exportFile('csv')} />
      </Card>
      <Card>
        <T bold>Import</T>
        <T small muted>
          Restore a backup, or import a CSV from this app or from Strong (Settings → Export Strong Data). Workouts you already have are
          skipped, so importing the same file twice is safe.
        </T>
        <View style={styles.rowBetween}>
          <T small muted style={{ flex: 1 }}>
            Strong files with no unit in the header are in
          </T>
          <Chips options={[{ value: 'kg' as const, label: 'kg' }, { value: 'lb' as const, label: 'lb' }]} value={importUnit} onChange={setImportUnit} />
        </View>
        <Button title={importing ? 'Importing…' : 'Choose file'} disabled={importing} onPress={importFile} />
      </Card>
      <Card>
        <T bold>Sync</T>
        {account.server ? (
          <>
            <T small muted>
              {account.server.username} @ {account.server.baseUrl}
            </T>
            <T small muted>
              {store.pendingCount()} pending · last sync {store.lastSyncAt ? new Date(store.lastSyncAt).toLocaleTimeString() : 'never'}
            </T>
            {store.lastSyncError && (
              <T small style={{ color: '#dc2626' }}>
                {store.lastSyncError}
              </T>
            )}
            <Button
              title="Sync now"
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
        <T bold>About & license</T>
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
