// FIXTURE — deliberately violating. Never imported by src/. See tests/lint/boundary.test.ts.
// Layering (Constitution II): src/sim must never reach into the presentation layer.
import Phaser from 'phaser';

export const rendererKind: number = Phaser.AUTO;
