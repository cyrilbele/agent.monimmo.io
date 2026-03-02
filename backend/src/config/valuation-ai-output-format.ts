export const MAX_VALUATION_AI_OUTPUT_FORMAT_LENGTH = 20_000;

export const DEFAULT_VALUATION_AI_OUTPUT_FORMAT = `# 📊 Analyse de valeur – Bien immobilier

---

## 1️⃣ Synthèse exécutive

**Valeur de marché estimée :**  
\`XXX XXX €\`

**Fourchette de commercialisation conseillée :**  
\`XXX XXX € – XXX XXX €\`

**Positionnement recommandé :**  
_Bas marché / Prix marché / Haut marché / Premium stratégique_

**Niveau de confiance :**  
_Élevé / Moyen / Faible_  
Justification : _1 phrase expliquant la fiabilité de l’estimation_

---

## 2️⃣ Données clés du bien

- **Type de bien :**  
- **Localisation :**  
- **Surface habitable :** XX m²  
- **Surface terrain :** XX m²  
- **Année de construction :** XXXX  
- **État général :** (neuf / rénové / à rafraîchir / à rénover)  
- **Standing :** (standard / bon / haut de gamme / luxe)  
- **DPE :** X  
- **Équipements principaux :**  
- **Copropriété :** (oui/non + nombre de lots + charges mensuelles)

---

## 3️⃣ Méthodologie d’évaluation

### 3.1 Analyse par comparables

- **Rayon d’analyse :** X km  
- **Période étudiée :** X derniers mois  
- **Nombre de ventes retenues :** X  
- **Fourchette surfaces comparables :** XX–XX m²  

**Indicateurs statistiques :**

- Médiane prix : \`XXX XXX €\`
- Médiane prix/m² : \`X XXX €/m²\`
- Quartile bas : \`XXX XXX €\`
- Quartile haut : \`XXX XXX €\`

**Projection brute par m² :**

> Surface du bien × Médiane prix/m² = **XXX XXX €**

---

### 3.2 Modèle statistique (si disponible)

- **Type de modèle :** (régression / modèle hédonique / ML)  
- **Valeur issue du modèle :** \`XXX XXX €\`  
- **Positionnement dans l’échantillon :** (bas / médian / haut)

---

## 4️⃣ Ajustements appliqués

### 🔻 Décotes

| Facteur | Impact estimé | Justification |
|----------|--------------|---------------|
| État du bien | -X % | |
| Travaux nécessaires | -X % | |
| Assainissement | -X % | |
| Absence piscine | -X % | |
| Copropriété / charges | -X % | |

**Total décotes : -X %**

---

### 🔺 Surcotes

| Facteur | Impact estimé | Justification |
|----------|--------------|---------------|
| Taille du terrain | +X % | |
| Localisation recherchée | +X % | |
| Environnement calme | +X % | |
| Performance énergétique | +X % | |
| Équipements premium | +X % | |

**Total surcotes : +X %**

---

### Ajustement global

- **Base statistique retenue :** \`XXX XXX €\`
- **Ajustement net appliqué :** ± X %
- **Valeur ajustée finale :** \`XXX XXX €\`

---

## 5️⃣ Analyse de cohérence marché

- **Prix affiché actuel :** \`XXX XXX €\`
- **Écart par rapport à l’estimation :** ± X %
- **Lecture stratégique :**  
  - ☐ Sous-évalué  
  - ☐ Cohérent marché  
  - ☐ Surévalué  

---

## 6️⃣ Fourchette opérationnelle

- **Prix d’attaque recommandé :** \`XXX XXX €\`
- **Prix plancher négociation probable :** \`XXX XXX €\`
- **Délai de commercialisation estimé :** X à X semaines

---

## 7️⃣ Risques identifiés

- **Risque technique :**  
- **Risque administratif :**  
- **Risque liquidité :**  
- **Sensibilité conjoncture (taux / saisonnalité) :**`;

export const normalizeValuationAiOutputFormatForPersistence = (
  value: unknown,
): string | null => {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  return trimmed.slice(0, MAX_VALUATION_AI_OUTPUT_FORMAT_LENGTH);
};

export const resolveValuationAiOutputFormat = (value: unknown): string => {
  return (
    normalizeValuationAiOutputFormatForPersistence(value) ??
    DEFAULT_VALUATION_AI_OUTPUT_FORMAT
  );
};
