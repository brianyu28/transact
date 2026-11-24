/** Planner scenarios: income, deductions and tax rules for "what will I take home?". */
import type { PlannerScenario, TaxRule } from '../schema/types';
import { scenarioTemplate, usTaxRules, type TemplateOptions } from '../planner/templates';
import { CommandError, defineCommand, required, tombstone } from './define';
import type { Id } from '../schema/types';

/** Drops references to taxes that no longer exist (e.g. after deleting a rule). */
function cleanTaxes(taxes: readonly TaxRule[]): TaxRule[] {
  const ids = new Set(taxes.map((t) => t.id));
  return taxes.map((t) => {
    if (!t.lessTaxes) return t;
    const lessTaxes = t.lessTaxes.filter((l) => ids.has(l.taxId) && l.taxId !== t.id);
    const next: TaxRule = { ...t, lessTaxes };
    if (lessTaxes.length === 0) Reflect.deleteProperty(next, 'lessTaxes');
    return next;
  });
}

export const createScenario = defineCommand<
  { name: string; year: number; template: TemplateOptions | null },
  Id
>({
  label: 'Add scenario',
  run(draft, { name, year, template }, { now, newId }) {
    const scenario: PlannerScenario = template
      ? scenarioTemplate({ ...template, name: name.trim() || 'Scenario', year, now }, newId)
      : {
          id: newId('plannerScenario'),
          name: name.trim() || 'Scenario',
          year,
          incomes: [],
          deductions: [],
          taxes: [],
          updatedAt: now,
        };
    draft.planner.scenarios[scenario.id] = scenario;
    return scenario.id;
  },
});

export type ScenarioChanges = Partial<
  Pick<PlannerScenario, 'name' | 'year' | 'people' | 'incomes' | 'deductions' | 'taxes'>
>;

export const updateScenario = defineCommand<{ id: Id; changes: ScenarioChanges }>({
  label: 'Edit scenario',
  run(draft, { id, changes }, { now }) {
    const s = required(draft.planner.scenarios[id], 'Scenario');
    if (changes.name !== undefined) {
      if (!changes.name.trim()) throw new CommandError('Give the scenario a name.');
      s.name = changes.name.trim();
    }
    if (changes.year !== undefined) s.year = changes.year;
    if (changes.incomes) s.incomes = structuredClone(changes.incomes);
    if (changes.deductions) s.deductions = structuredClone(changes.deductions);
    if (changes.taxes) s.taxes = cleanTaxes(structuredClone(changes.taxes));
    if (changes.people) {
      if (changes.people.some((p) => !p.name.trim()))
        throw new CommandError('Every person needs a name.');
      if (changes.people.length) s.people = structuredClone(changes.people);
      else Reflect.deleteProperty(s, 'people');
    }
    // Items that belonged to a removed person become the household's.
    const people = new Set((s.people ?? []).map((p) => p.id));
    for (const item of [...s.incomes, ...s.deductions]) {
      if (item.person !== undefined && !people.has(item.person))
        Reflect.deleteProperty(item, 'person');
    }
    s.updatedAt = now;
  },
});

/** Adds a template's tax rules to an existing scenario. */
export const addTemplateRules = defineCommand<{ id: Id; template: TemplateOptions }>({
  label: 'Add tax rules',
  run(draft, { id, template }, { now, newId }) {
    const s = required(draft.planner.scenarios[id], 'Scenario');
    s.taxes.push(...usTaxRules(template, newId));
    s.updatedAt = now;
  },
});

export const duplicateScenario = defineCommand<{ id: Id }, Id>({
  label: 'Duplicate scenario',
  run(draft, { id }, { now, newId }) {
    const source = required(draft.planner.scenarios[id], 'Scenario');
    // JSON round-trip: a plain deep copy that also works on Immer drafts.
    const copy = JSON.parse(JSON.stringify(source)) as PlannerScenario;
    // New ids everywhere, keeping "less other taxes" links pointing at the copies.
    const remap = new Map<Id, Id>();
    for (const t of copy.taxes) {
      const fresh = newId('plannerItem');
      remap.set(t.id, fresh);
      t.id = fresh;
    }
    for (const t of copy.taxes) {
      for (const l of t.lessTaxes ?? []) l.taxId = remap.get(l.taxId) ?? l.taxId;
    }
    const people = new Map((copy.people ?? []).map((p) => [p.id, newId('plannerItem')]));
    const remapPerson = (person: Id | undefined) => {
      const mapped = person ? people.get(person) : undefined;
      return mapped ? { person: mapped } : {};
    };
    const scenario: PlannerScenario = {
      id: newId('plannerScenario'),
      name: `${copy.name} (copy)`,
      year: copy.year,
      ...(copy.people?.length
        ? { people: copy.people.map((p) => ({ ...p, id: people.get(p.id) ?? p.id })) }
        : {}),
      incomes: copy.incomes.map((i) => ({
        ...i,
        id: newId('plannerItem'),
        ...remapPerson(i.person),
      })),
      deductions: copy.deductions.map((d) => ({
        ...d,
        id: newId('plannerItem'),
        ...remapPerson(d.person),
      })),
      taxes: copy.taxes,
      updatedAt: now,
    };
    draft.planner.scenarios[scenario.id] = scenario;
    return scenario.id;
  },
});

export const deleteScenario = defineCommand<{ id: Id }>({
  label: 'Delete scenario',
  run(draft, { id }, { now }) {
    required(draft.planner.scenarios[id], 'Scenario');
    Reflect.deleteProperty(draft.planner.scenarios, id);
    tombstone(draft, id, now);
  },
});
