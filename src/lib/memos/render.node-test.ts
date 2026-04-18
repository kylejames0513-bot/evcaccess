import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { renderTemplate, renderClassMemo, buildClassContext, type ClassMemoInput } from "./render";

describe("renderTemplate", () => {
  it("substitutes single-key placeholders", () => {
    assert.equal(renderTemplate("Hello {{name}}", { name: "World" }), "Hello World");
  });

  it("substitutes nested dotted placeholders", () => {
    assert.equal(
      renderTemplate("{{class.title}} on {{class.date}}", {
        class: { title: "CPR", date: "Apr 23" },
      }),
      "CPR on Apr 23",
    );
  });

  it("renders missing keys as empty string (not 'undefined')", () => {
    assert.equal(renderTemplate("X {{missing}} Y", {}), "X  Y");
    assert.equal(renderTemplate("X {{a.b.c}} Y", { a: {} }), "X  Y");
  });

  it("leaves unknown syntax alone if no match", () => {
    // template has just a literal { and should not regex-trigger
    assert.equal(renderTemplate("literal {not a placeholder}", {}), "literal {not a placeholder}");
  });

  it("handles whitespace inside placeholders", () => {
    assert.equal(renderTemplate("{{   name   }}", { name: "Kyle" }), "Kyle");
  });

  it("handles multiple identical placeholders", () => {
    assert.equal(renderTemplate("{{x}}-{{x}}", { x: 7 }), "7-7");
  });
});

describe("renderClassMemo", () => {
  const baseInput: ClassMemoInput = {
    session: {
      scheduled_start: "2026-04-23T09:00:00",
      scheduled_end: "2026-04-23T12:00:00",
      location: "Main Office — Room A",
      trainer_name: "Jane Doe",
    },
    training: { code: "CPR_FA", title: "CPR & First Aid" },
    roster: [
      {
        legal_last_name: "Smith",
        legal_first_name: "John",
        preferred_name: null,
        department: "Residential",
        location: null,
        position: "Direct Support",
      },
      {
        legal_last_name: "Thompson",
        legal_first_name: "Mary",
        preferred_name: "Cindy",
        department: "Residential",
        location: null,
        position: "Direct Support",
      },
    ],
    signoff: "Kyle Mahoney\nHR Program Coordinator · Emory Valley Center",
  };

  const template = {
    subject_template: "{{class.title}} — {{class.date}} — {{class.time}}",
    body_template:
      "Training: {{class.title}} ({{class.code}})\nAttendees ({{attendee_count}}):\n{{attendee_list}}\n\n{{signoff}}",
  };

  it("renders the subject with date + time formatting", () => {
    const { subject } = renderClassMemo(template, baseInput);
    assert.match(subject, /CPR & First Aid/);
    assert.match(subject, /April/); // long-form month, en-US
    assert.match(subject, /9:00 AM/);
  });

  it("renders the attendee list with preferred names in parens", () => {
    const { body } = renderClassMemo(template, baseInput);
    assert.match(body, /1\. Smith, John/);
    assert.match(body, /2\. Thompson, Mary \(Cindy\)/);
  });

  it("empty roster yields '(roster empty)' and attendee_count=0", () => {
    const { body } = renderClassMemo(template, { ...baseInput, roster: [] });
    assert.match(body, /Attendees \(0\)/);
    assert.match(body, /\(roster empty\)/);
  });

  it("missing trainer leaves the field blank but doesn't crash", () => {
    const tmpl = {
      subject_template: "{{class.title}}",
      body_template: "Trainer: {{class.trainer}}",
    };
    const out = renderClassMemo(tmpl, {
      ...baseInput,
      session: { ...baseInput.session, trainer_name: null },
    });
    assert.equal(out.body, "Trainer: ");
  });

  it("plainText has 'Subject:' prefix followed by blank line + body", () => {
    const { plainText, body, subject } = renderClassMemo(template, baseInput);
    assert.equal(plainText, `Subject: ${subject}\n\n${body}`);
  });
});

describe("buildClassContext", () => {
  it("produces a zero-indexed context with all documented keys", () => {
    const ctx = buildClassContext({
      session: { scheduled_start: null, scheduled_end: null, location: null, trainer_name: null },
      training: { code: "X", title: "Y" },
      roster: [],
      signoff: null,
    });
    assert.ok(ctx.class);
    assert.equal((ctx.class as Record<string, unknown>).title, "Y");
    assert.equal((ctx.class as Record<string, unknown>).code, "X");
    assert.equal(ctx.attendee_count, "0");
    assert.equal(ctx.signoff, "");
  });
});
