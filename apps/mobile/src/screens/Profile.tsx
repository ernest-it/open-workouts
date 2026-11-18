import { useMemo, useState } from 'react';
import { Alert, Linking, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { MEASUREMENT_KINDS, fromKg, importStrongCsv, toKg, workoutsPerWeek, type MeasurementKind } from '@open-workouts/shared';
import { usePrefs, useStore, type Account, type Prefs } from '../state';
import { Button, Card, Chips, H2, NumInput, Screen, T, formatDate, label, styles, useTheme } from '../ui';

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
      </Card>
      <Measurements prefs={prefs} />
    </Screen>
  );
}

function Measurements({ prefs }: { prefs: Prefs }) {
  const store = useStore();
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
          <NumInput value={value} onChange={setValue} />
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
          <Button small variant="danger" title="✕" onPress={() => store.remove('measurements', m.id)} />
        </View>
      ))}
    </View>
  );
}

export function SettingsScreen({ account, onSignOut }: { account: Account; onSignOut: () => void }) {
  const store = useStore();
  const prefs = usePrefs();
  const setPref = (p: Partial<Prefs>) => store.setSetting('prefs', { ...prefs, ...p });
  const [importUnit, setImportUnit] = useState<'kg' | 'lb'>(prefs.weightUnit);

  async function importCsv() {
    const res = await DocumentPicker.getDocumentAsync({ type: ['text/csv', 'text/comma-separated-values', 'text/plain', '*/*'], copyToCacheDirectory: true });
    if (res.canceled || !res.assets?.[0]) return;
    try {
      const text = await new File(res.assets[0].uri).text();
      // Parsed on-device so it also works in local-only mode; synced afterwards.
      const r = importStrongCsv(text, {
        weightUnit: importUnit,
        distanceUnit: prefs.distanceUnit,
        existingExercises: store.all('exercises'),
      });
      store.applyRemote(r.changes, true);
      void store.sync().catch(() => {});
      Alert.alert('Import complete', `${r.summary.workouts} workouts, ${r.summary.sets} sets. ${r.summary.newExercises.length} new exercises.`);
    } catch (e) {
      Alert.alert('Import failed', (e as Error).message);
    }
  }

  return (
    <Screen title="Settings">
      <Card>
        <T bold>Units</T>
        <Chips options={[{ value: 'kg' as const, label: 'kg' }, { value: 'lb' as const, label: 'lb' }]} value={prefs.weightUnit} onChange={(v) => setPref({ weightUnit: v })} />
        <Chips options={[{ value: 'km' as const, label: 'km' }, { value: 'mi' as const, label: 'mi' }]} value={prefs.distanceUnit} onChange={(v) => setPref({ distanceUnit: v })} />
        <T muted>Default rest timer (seconds)</T>
        <NumInput value={prefs.restSeconds} onChange={(v) => setPref({ restSeconds: v ?? 0 })} />
        <T muted>Bar weight ({prefs.weightUnit})</T>
        <NumInput value={+fromKg(prefs.barWeightKg, prefs.weightUnit).toFixed(2)} onChange={(v) => setPref({ barWeightKg: toKg(v ?? 0, prefs.weightUnit) })} />
      </Card>
      <Card>
        <T bold>Import from Strong</T>
        <T small muted>
          Export from Strong (Settings → Export Strong Data), then pick the CSV. Re-importing is safe.
        </T>
        <Chips options={[{ value: 'kg' as const, label: 'File is in kg' }, { value: 'lb' as const, label: 'File is in lb' }]} value={importUnit} onChange={setImportUnit} />
        <Button title="Choose CSV file" onPress={importCsv} />
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
            <Button title="Sync now" onPress={() => void store.sync().catch(() => {})} />
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
        onPress={() =>
          Alert.alert(
            account.server ? 'Sign out?' : 'Leave local mode?',
            account.server
              ? store.pendingCount()
                ? 'Some changes have not synced yet and will be lost.'
                : 'Your data stays on the server.'
              : 'Local data stays on this device and comes back if you choose local mode again.',
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Continue', style: 'destructive', onPress: onSignOut },
            ],
          )
        }
      />
    </Screen>
  );
}
