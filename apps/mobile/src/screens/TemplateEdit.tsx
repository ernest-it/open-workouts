import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { formatDuration, fromKg, toKg, type LogType, type SetKind, type TemplateExercise, type TemplateSet } from '@open-workouts/shared';
import { useNav } from '../nav';
import { usePrefs, useStore, type Prefs } from '../state';
import { Button, Card, Chips, Eyebrow, Input, NumInput, Screen, T, styles, useTheme } from '../ui';
import { useDialog } from '../dialog';
import { ExercisePicker, KIND_LABEL, SetBadge } from '../workoutParts';

type Field = 'weight' | 'reps' | 'distance' | 'duration';

function fieldsFor(lt: LogType | undefined): Field[] {
  if (lt === 'duration') return ['duration'];
  if (lt === 'distance_duration') return ['distance', 'duration'];
  if (lt === 'reps') return ['reps'];
  return ['weight', 'reps'];
}

/** Edit a template on the phone: name, folder, exercises, sets and target values. */
export function TemplateEditScreen({ id }: { id: string }) {
  const store = useStore();
  const prefs = usePrefs();
  const nav = useNav();
  const dialog = useDialog();
  const t = useTheme();
  const [picking, setPicking] = useState(false);
  const tpl = store.get('templates', id);
  if (!tpl)
    return (
      <Screen>
        <T>Template not found.</T>
      </Screen>
    );
  const tes = store.templateExercises(id);
  const folders = store.all('templateFolders').sort((a, b) => a.position - b.position);

  const newFolder = async () => {
    const name = await dialog.prompt({ title: 'New folder', placeholder: 'Folder name, e.g. PPL', confirmText: 'Create' });
    if (!name) return;
    const f = store.insert('templateFolders', { name, position: folders.length });
    store.update('templates', id, { folderId: f.id });
  };

  return (
    <View style={{ flex: 1 }}>
      <Screen>
        <Eyebrow style={{ marginTop: 4 }}>Name</Eyebrow>
        <Input
          value={tpl.name}
          onChangeText={(v) => store.update('templates', id, { name: v })}
          placeholder="Template name"
          accessibilityLabel="Template name"
          style={{ backgroundColor: t.surface, fontSize: 18, fontWeight: '700' }}
        />
        <Eyebrow>Folder</Eyebrow>
        <View style={[styles.row, { flexWrap: 'wrap', gap: 6 }]}>
          <Chips
            options={[{ value: '', label: 'My templates' }, ...folders.map((f) => ({ value: f.id, label: f.name }))]}
            value={tpl.folderId ?? ''}
            onChange={(v) => store.update('templates', id, { folderId: v || null })}
          />
        </View>
        <Button small variant="ghost" icon="folder-open-outline" title="New folder" onPress={newFolder} style={{ alignSelf: 'flex-start' }} />
        <Eyebrow>Notes</Eyebrow>
        <Input
          value={tpl.notes ?? ''}
          multiline
          placeholder="Optional, e.g. the programme or week"
          onChangeText={(v) => store.update('templates', id, { notes: v || null })}
          style={{ backgroundColor: t.surface, minHeight: 56, textAlignVertical: 'top' }}
        />

        <Eyebrow style={{ marginTop: 18 }}>
          Exercises · {tes.length}
        </Eyebrow>
        {tes.length === 0 && <T muted>No exercises yet. Add the first one below.</T>}
        {tes.map((te, i) => (
          <TemplateExerciseCard key={te.id} te={te} index={i} count={tes.length} prefs={prefs} />
        ))}
        <Button title="Add exercise" icon="add" variant="primary" onPress={() => setPicking(true)} style={{ marginTop: 6 }} />
        <Button
          title="Delete template"
          variant="danger"
          style={{ marginTop: 20 }}
          onPress={async () => {
            const ok = await dialog.confirm({
              title: `Delete "${tpl.name}"?`,
              message: 'Past workouts started from it are kept.',
              confirmText: 'Delete',
              destructive: true,
            });
            if (!ok) return;
            store.deleteTemplate(id);
            nav.pop();
            nav.pop();
            dialog.toast('Template deleted');
          }}
        />
      </Screen>
      <ExercisePicker
        visible={picking}
        onClose={() => setPicking(false)}
        onPick={(e) => {
          store.addExerciseToTemplate(id, e.id);
          setPicking(false);
        }}
      />
    </View>
  );
}

function TemplateExerciseCard({ te, index, count, prefs }: { te: TemplateExercise; index: number; count: number; prefs: Prefs }) {
  const store = useStore();
  const dialog = useDialog();
  const t = useTheme();
  const ex = store.get('exercises', te.exerciseId);
  const sets = store.templateSetsOf(te.id);
  const fields = fieldsFor(ex?.logType);
  const name = ex?.name ?? 'Unknown exercise';

  const openMenu = async () => {
    const choice = await dialog.menu({
      title: name,
      options: [
        ...(index > 0 ? [{ text: 'Move up', value: 'up' }] : []),
        ...(index < count - 1 ? [{ text: 'Move down', value: 'down' }] : []),
        { text: te.restSeconds ? `Rest timer (${formatDuration(te.restSeconds)})` : 'Rest timer', value: 'rest' },
        { text: te.notes ? 'Edit note' : 'Add note', value: 'note' },
        { text: 'Remove exercise', value: 'remove', destructive: true },
      ],
    });
    if (choice === 'up') store.moveTemplateExercise(te.id, -1);
    else if (choice === 'down') store.moveTemplateExercise(te.id, 1);
    else if (choice === 'rest') {
      const v = await dialog.prompt({
        title: 'Rest timer',
        message: `Seconds of rest after each set. Leave empty to use your default (${prefs.restSeconds} s).`,
        defaultValue: te.restSeconds ? String(te.restSeconds) : '',
        placeholder: String(prefs.restSeconds),
        allowEmpty: true,
      });
      if (v == null) return;
      const n = Math.round(Number(v));
      store.update('templateExercises', te.id, { restSeconds: v.trim() && n > 0 ? n : null });
    } else if (choice === 'note') {
      const v = await dialog.prompt({ title: 'Note', defaultValue: te.notes ?? '', placeholder: 'e.g. pause at the bottom', allowEmpty: true });
      if (v != null) store.update('templateExercises', te.id, { notes: v.trim() || null });
    } else if (choice === 'remove') store.removeTemplateExercise(te.id);
  };

  let n = 0;
  return (
    <Card>
      <View style={styles.rowBetween}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: t.text, fontWeight: '800', fontSize: 16 }}>{name}</Text>
          <Text style={{ color: t.muted, fontSize: 12, fontWeight: '600' }}>
            {sets.length} set{sets.length === 1 ? '' : 's'}
            {te.restSeconds ? ` · rest ${formatDuration(te.restSeconds)}` : ''}
          </Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={`More options for ${name}`} hitSlop={10} onPress={openMenu} style={local.more}>
          <Ionicons name="ellipsis-horizontal" size={20} color={t.muted} />
        </Pressable>
      </View>
      {te.notes ? (
        <T small muted style={{ marginTop: 4 }}>
          {te.notes}
        </T>
      ) : null}
      <View style={[styles.row, { marginTop: 10, paddingHorizontal: 4 }]}>
        <Text style={[local.head, local.cSet, { color: t.muted, textAlign: 'center' }]}>SET</Text>
        {fields.map((f) => (
          <Text key={f} style={[local.head, local.cNum, { color: t.muted }]}>
            {f === 'weight' ? prefs.weightUnit.toUpperCase() : f === 'distance' ? prefs.distanceUnit.toUpperCase() : f === 'duration' ? 'SEC' : 'REPS'}
          </Text>
        ))}
        <View style={local.cDel} />
      </View>
      {sets.map((s) => {
        const label = KIND_LABEL[s.kind] || String(++n);
        return <TemplateSetRow key={s.id} s={s} label={label} fields={fields} prefs={prefs} />;
      })}
      <Button small title="Add set" icon="add" onPress={() => store.addTemplateSet(te.id)} style={{ marginTop: 8 }} />
    </Card>
  );
}

function TemplateSetRow({ s, label, fields, prefs }: { s: TemplateSet; label: string; fields: Field[]; prefs: Prefs }) {
  const store = useStore();
  const dialog = useDialog();
  const t = useTheme();
  const dist = prefs.distanceUnit === 'mi' ? 1609.344 : 1000;
  const show = (f: Field, v: number | null) =>
    v == null ? null : f === 'weight' ? +fromKg(v, prefs.weightUnit).toFixed(2) : f === 'distance' ? +(v / dist).toFixed(3) : v;
  const save = (f: Field, v: number | null) =>
    v == null ? null : f === 'weight' ? toKg(v, prefs.weightUnit) : f === 'distance' ? v * dist : f === 'reps' ? Math.round(v) : v;
  const kindMenu = async () => {
    const mark = (k: SetKind, text: string) => ({ text: s.kind === k ? `✓ ${text}` : text, value: k });
    const choice = await dialog.menu({
      title: `Set ${label}`,
      options: [mark('normal', 'Normal set'), mark('warmup', 'Warm-up'), mark('drop', 'Drop set'), mark('failure', 'Failure')],
    });
    if (choice) store.update('templateSets', s.id, { kind: choice });
  };
  return (
    <View style={[styles.row, { paddingVertical: 3, paddingHorizontal: 4 }]}>
      <Pressable style={local.cSet} onPress={kindMenu} accessibilityRole="button" accessibilityLabel={`Set ${label} type`} hitSlop={6}>
        <SetBadge kind={s.kind} text={label} />
      </Pressable>
      {fields.map((f) => (
        <NumInput
          key={f}
          style={local.cNum}
          value={show(f, s[f])}
          placeholder="—"
          accessibilityLabel={`Set ${label} ${f}`}
          onChange={(v) => store.update('templateSets', s.id, { [f]: save(f, v) })}
        />
      ))}
      <Pressable
        style={[local.cDel, local.del]}
        onPress={() => store.remove('templateSets', s.id)}
        accessibilityRole="button"
        accessibilityLabel={`Delete set ${label}`}
        hitSlop={6}
      >
        <Ionicons name="close" size={18} color={t.muted} />
      </Pressable>
    </View>
  );
}

const local = StyleSheet.create({
  more: { padding: 6 },
  head: { fontSize: 11, fontWeight: '700', letterSpacing: 0.6 },
  cSet: { width: 32 },
  cNum: { flex: 1, minWidth: 0, textAlign: 'center', borderRadius: 10 },
  cDel: { width: 36 },
  del: { height: 36, alignItems: 'center', justifyContent: 'center' },
});

