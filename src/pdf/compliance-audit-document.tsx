import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

const styles = StyleSheet.create({
  page: { padding: 36, fontSize: 9, fontFamily: "Helvetica" },
  title: { fontSize: 16, marginBottom: 8 },
  meta: { fontSize: 9, color: "#444", marginBottom: 16 },
  row: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#ddd", paddingVertical: 4 },
  cell: { flex: 1, paddingRight: 4 },
  footer: { position: "absolute", bottom: 28, left: 36, right: 36, fontSize: 8, color: "#666" },
  signature: { marginTop: 32, borderTopWidth: 1, borderTopColor: "#000", width: 220, paddingTop: 6 },
});

export function ComplianceAuditDocument({
  orgName,
  generatedAt,
  lines,
}: {
  orgName: string;
  generatedAt: string;
  lines: { employee: string; paylocity_id: string; training: string; status: string }[];
}) {
  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        <Text style={styles.title}>Compliance audit snapshot</Text>
        <Text style={styles.meta}>
          {orgName} · Generated {generatedAt}
        </Text>
        <View style={styles.row}>
          <Text style={[styles.cell, { fontWeight: "bold" }]}>Employee</Text>
          <Text style={[styles.cell, { fontWeight: "bold", maxWidth: 80 }]}>Paylocity ID</Text>
          <Text style={[styles.cell, { fontWeight: "bold" }]}>Training</Text>
          <Text style={[styles.cell, { fontWeight: "bold", maxWidth: 70 }]}>Status</Text>
        </View>
        {lines.map((l, i) => (
          <View key={i} style={styles.row} wrap={false}>
            <Text style={styles.cell}>{l.employee}</Text>
            <Text style={[styles.cell, { maxWidth: 80 }]}>{l.paylocity_id}</Text>
            <Text style={styles.cell}>{l.training}</Text>
            <Text style={[styles.cell, { maxWidth: 70 }]}>{l.status}</Text>
          </View>
        ))}
        <View style={styles.signature}>
          <Text>Authorized signature</Text>
        </View>
        <Text style={styles.footer} fixed>
          HR Program Coordinator: Kyle Mahoney
        </Text>
      </Page>
    </Document>
  );
}
