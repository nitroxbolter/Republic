import type { ComplaintKind } from '../../sim/systems/needs';

/** Complaint speech bubbles (docs/specs/needs.md): a white bubble with a tail and an icon. */

export const BUBBLE_W = 22;
export const BUBBLE_H = 22;
export const BUBBLE_KINDS: readonly ComplaintKind[] = ['jobs', 'shopping', 'safety', 'health', 'education', 'commute', 'air', 'parks', 'affordability', 'workers', 'customers', 'hospital', 'university', 'garbage', 'transit', 'research', 'abandoned'];

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Bubble body (18×16 at the top) with a tail pointing down to the building. */
function body(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
  roundRect(ctx, 2, 2, 19, 16, 5);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  roundRect(ctx, 1, 1, 19, 16, 5);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(7, 16);
  ctx.lineTo(10, 21);
  ctx.lineTo(13, 16);
  ctx.fill();
}

export function paintBubble(ctx: CanvasRenderingContext2D, kind: ComplaintKind) {
  body(ctx);
  const ink = '#2b2f36';
  const fill = (c: string) => {
    ctx.fillStyle = c;
  };
  switch (kind) {
    case 'jobs': // briefcase
      fill('#8a5a33');
      ctx.fillRect(5, 7, 11, 7);
      fill(ink);
      ctx.fillRect(8.5, 5, 4, 2);
      fill('#f2c94c');
      ctx.fillRect(10, 9.5, 1.5, 1.5);
      break;
    case 'shopping': // bag
      fill('#e2574c');
      ctx.fillRect(6, 7.5, 9, 7);
      ctx.strokeStyle = ink;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(10.5, 7.5, 2.5, Math.PI, 0);
      ctx.stroke();
      break;
    case 'safety': // shield
      fill('#3b6fd8');
      ctx.beginPath();
      ctx.moveTo(10.5, 3.5);
      ctx.lineTo(16, 5.5);
      ctx.quadraticCurveTo(15.5, 12.5, 10.5, 15);
      ctx.quadraticCurveTo(5.5, 12.5, 5, 5.5);
      ctx.closePath();
      ctx.fill();
      fill('#ffffff');
      ctx.fillRect(9.8, 6.5, 1.4, 5);
      ctx.fillRect(8, 8.3, 5, 1.4);
      break;
    case 'health': // red cross
      fill('#e23b3b');
      ctx.fillRect(9, 4.5, 3, 9);
      ctx.fillRect(6, 7.5, 9, 3);
      break;
    case 'education': // book
      fill('#2f8f5b');
      ctx.fillRect(5, 6, 5.2, 8);
      ctx.fillRect(10.8, 6, 5.2, 8);
      fill('#ffffff');
      ctx.fillRect(6, 7.5, 3, 0.8);
      ctx.fillRect(12, 7.5, 3, 0.8);
      ctx.fillRect(6, 9.5, 3, 0.8);
      ctx.fillRect(12, 9.5, 3, 0.8);
      break;
    case 'commute': // car
      fill('#e2574c');
      ctx.fillRect(4.5, 9, 12, 3.5);
      ctx.fillRect(7, 6.5, 7, 3);
      fill('#bfe3ff');
      ctx.fillRect(8, 7.2, 5, 1.8);
      fill(ink);
      ctx.beginPath();
      ctx.arc(7.5, 12.8, 1.5, 0, Math.PI * 2);
      ctx.arc(13.5, 12.8, 1.5, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'air': // smoke cloud
      fill('#8b9097');
      ctx.beginPath();
      ctx.arc(8, 10, 3, 0, Math.PI * 2);
      ctx.arc(12, 8.5, 3.5, 0, Math.PI * 2);
      ctx.arc(14.5, 11, 2.5, 0, Math.PI * 2);
      ctx.fill();
      fill('#5d6168');
      ctx.fillRect(6, 12, 9.5, 1.5);
      break;
    case 'parks': // tree
      fill('#7a5230');
      ctx.fillRect(9.8, 10.5, 1.5, 4);
      fill('#3fa34d');
      ctx.beginPath();
      ctx.moveTo(10.5, 3.5);
      ctx.lineTo(15, 11);
      ctx.lineTo(6, 11);
      ctx.closePath();
      ctx.fill();
      break;
    case 'affordability': // coins
      fill('#d6a84f');
      for (const [x, y] of [[8, 10], [13, 10]] as const) {
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fill();
        fill('#fff3b0');
        ctx.fillRect(x - 1.5, y - 0.5, 3, 1);
        fill('#d6a84f');
      }
      break;
    case 'workers': // person
      fill('#3b6fd8');
      ctx.beginPath();
      ctx.arc(10.5, 6.5, 2.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(7.5, 9.5, 6, 5);
      break;
    case 'customers': // coins
      fill('#e0a514');
      for (const [x, y] of [
        [8, 11.5],
        [13, 11.5],
        [10.5, 7.5],
      ] as const) {
        ctx.beginPath();
        ctx.arc(x, y, 2.6, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    case 'hospital': // building with a red cross
      fill('#e9edf2');
      ctx.fillRect(5, 5, 11, 9.5);
      fill('#9aa3ad');
      ctx.fillRect(5, 13.5, 11, 1);
      fill('#d23b5a');
      ctx.fillRect(9.6, 6.5, 1.8, 6);
      ctx.fillRect(7.5, 8.6, 6, 1.8);
      break;
    case 'university': // graduation cap
      fill('#5b4fc4');
      ctx.beginPath();
      ctx.moveTo(10.5, 4.5);
      ctx.lineTo(17, 8);
      ctx.lineTo(10.5, 11.5);
      ctx.lineTo(4, 8);
      ctx.closePath();
      ctx.fill();
      ctx.fillRect(7, 9.5, 7, 3.5);
      fill('#f2c94c');
      ctx.fillRect(15.3, 8, 1, 4.5);
      break;
    case 'garbage': // bin with a lid
      fill('#7d8a3a');
      ctx.fillRect(6.5, 7, 8, 7.5);
      fill('#5b6628');
      ctx.fillRect(5.5, 5.5, 10, 1.8);
      ctx.fillRect(9.3, 4.2, 2.4, 1.4);
      fill('#a8b55a');
      ctx.fillRect(8, 8.5, 1, 4.5);
      ctx.fillRect(10, 8.5, 1, 4.5);
      ctx.fillRect(12, 8.5, 1, 4.5);
      break;
    case 'transit': // a bus, front on
      fill('#2f7fd6');
      ctx.fillRect(5.5, 4.5, 10, 9);
      fill('#bfe3ff');
      ctx.fillRect(6.5, 5.5, 8, 4);
      fill('#fff3b0');
      ctx.fillRect(6.5, 11, 1.6, 1.4);
      ctx.fillRect(12.9, 11, 1.6, 1.4);
      fill('#2b2f36');
      ctx.fillRect(6.5, 13.5, 2, 1.5);
      ctx.fillRect(12.5, 13.5, 2, 1.5);
      break;
    case 'research': // a flask
      fill('#22b8cf');
      ctx.beginPath();
      ctx.moveTo(9.3, 4);
      ctx.lineTo(11.7, 4);
      ctx.lineTo(11.7, 8);
      ctx.lineTo(15, 14.5);
      ctx.lineTo(6, 14.5);
      ctx.lineTo(9.3, 8);
      ctx.closePath();
      ctx.fill();
      fill('#ffffff');
      ctx.fillRect(8.8, 3.5, 3.4, 1);
      ctx.fillRect(8, 11.5, 2, 1.2);
      break;
    case 'abandoned': // boarded window
      fill('#5a4a3a');
      ctx.fillRect(5.5, 5, 10, 9.5);
      fill('#b98a52');
      ctx.save();
      ctx.translate(10.5, 9.75);
      ctx.rotate(0.5);
      ctx.fillRect(-6, -1.2, 12, 2.4);
      ctx.rotate(-1);
      ctx.fillRect(-6, -1.2, 12, 2.4);
      ctx.restore();
      break;
  }
}
