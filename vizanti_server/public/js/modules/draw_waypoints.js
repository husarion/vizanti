export function drawWaypoints(canvas, ctx, view, points, tf, fixed_frame, mode, margin = 0.8, startIndex = 0, startClosest = false) {

  const active = mode != "IDLE";
  const wid = canvas.width;
  const hei = canvas.height;

  ctx.clearRect(0, 0, wid, hei);

  const frame = tf.absoluteTransforms[fixed_frame];
  if (!frame) {
    throw Error("Fixed transform frame not selected or the TF data is missing.");
  }

  const color = mode != "Z" ? "#EBCE00" : "#abcbff";
  const OUTLINE_PX = mode != "Z" ? 13 : 18;
  const INNER_PX = mode != "Z" ? 10 : 15;

  const viewPoints = points.map((point) =>
    pointToScreen(point, view, tf, fixed_frame)
  );

  if (margin > 0) {
    drawOffsetPath(ctx, viewPoints, margin * view.getMapUnitsInPixels(1.0), startIndex, startClosest);
  }

  ctx.lineWidth = 3;
  ctx.fillStyle = active ? "white" : color
  if (startClosest)
    ctx.strokeStyle = "#4a4a4a";
  else
    ctx.strokeStyle = color;

  const minZ = Math.min(...points.map(p => p.z));
  const maxZ = Math.max(...points.map(p => p.z));

  //draw path gradients
  if (minZ != maxZ) {
    function scale_color(x, y, z, scale) {
      let r = y[0];
      let g = y[1];
      let b = y[2];
      if (scale < 0.5) {
        scale = scale * 2;
        const scaleinv = 1.0 - scale;
        r = scaleinv * x[0] + scale * r;
        g = scaleinv * x[1] + scale * g;
        b = scaleinv * x[2] + scale * b;
      } else if (scale > 0.5) {
        scale = (scale - 0.5) * 2;
        const scaleinv = 1.0 - scale;
        r = scale * z[0] + scaleinv * r;
        g = scale * z[1] + scaleinv * g;
        b = scale * z[2] + scaleinv * b;
      }
      return `rgba(${r},${g},${b},1.0)`;
    }

    for (let i = 0; i < viewPoints.length - 1; i++) {
      const pos = viewPoints[i];
      const next = viewPoints[i + 1];

      const grad = ctx.createLinearGradient(pos.x, pos.y, next.x, next.y)
      const start_scale = (points[i].z - minZ) / (maxZ - minZ);
      const end_scale = (points[i + 1].z - minZ) / (maxZ - minZ);
      const mid_scale = (start_scale + end_scale) * 0.5;

      if (mode != "Z") {
        grad.addColorStop(0.0, scale_color(DARK_YELLOW, PURE_YELLOW, LIGHT_YELLOW, start_scale));
        grad.addColorStop(0.5, scale_color(DARK_YELLOW, PURE_YELLOW, LIGHT_YELLOW, mid_scale));
        grad.addColorStop(1.0, scale_color(DARK_YELLOW, PURE_YELLOW, LIGHT_YELLOW, end_scale));
      } else {//blue
        grad.addColorStop(0.0, scale_color(DARK_BLUE, PURE_BLUE, LIGHT_BLUE, start_scale));
        grad.addColorStop(0.5, scale_color(DARK_BLUE, PURE_BLUE, LIGHT_BLUE, mid_scale));
        grad.addColorStop(1.0, scale_color(DARK_BLUE, PURE_BLUE, LIGHT_BLUE, end_scale));
      }

      if (startClosest && i < startIndex) {
        ctx.strokeStyle = "#545454";
      } else {
        ctx.strokeStyle = grad;
      }

      ctx.beginPath();
      ctx.moveTo(pos.x, pos.y);
      ctx.lineTo(next.x, next.y);
      ctx.stroke();
    }

  }
  else //draw monocolour path
  {
    ctx.beginPath();
    for (let i = 0; i < viewPoints.length; i++) {
      const pos = viewPoints[i];

      if (i == startIndex && startClosest) {
        ctx.lineTo(pos.x, pos.y);
        ctx.stroke();
        ctx.strokeStyle = color;
        ctx.beginPath();
      }

      if (i === 0) {
        ctx.moveTo(pos.x, pos.y);
      } else {
        ctx.lineTo(pos.x, pos.y);
      }
    };
    ctx.stroke();
  }

  function drawCircles() {
    //circle outlines
    ctx.fillStyle = "#292929";
    ctx.beginPath();
    for (let i = 0; i < viewPoints.length; i++) {
      const pos = viewPoints[i];
      ctx.moveTo(pos.x + OUTLINE_PX, pos.y);
      ctx.arc(pos.x, pos.y, OUTLINE_PX, 0, 2 * Math.PI, false);
    };
    ctx.fill();

    //circle middle
    if (startClosest) {
      ctx.fillStyle = active ? "white" : "#827c52";
      ctx.beginPath();
      for (let i = 0; i < startIndex; i++) {
        const pos = viewPoints[i];
        ctx.moveTo(pos.x + INNER_PX, pos.y);
        ctx.arc(pos.x, pos.y, INNER_PX, 0, 2 * Math.PI, false);
      }
      ctx.fill();

      ctx.fillStyle = active ? "white" : color;
      ctx.beginPath();
      for (let i = startIndex; i < viewPoints.length; i++) {
        const pos = viewPoints[i];
        ctx.moveTo(pos.x + INNER_PX, pos.y);
        ctx.arc(pos.x, pos.y, INNER_PX, 0, 2 * Math.PI, false);
      }
      ctx.fill();
    }
    else {
      ctx.fillStyle = active ? "white" : color;
      ctx.beginPath();
      for (let i = 0; i < viewPoints.length; i++) {
        const pos = viewPoints[i];
        ctx.moveTo(pos.x + INNER_PX, pos.y);
        ctx.arc(pos.x, pos.y, INNER_PX, 0, 2 * Math.PI, false);
      }
      ctx.fill();
    }
  }

  function drawRectangles() {

    function traceRect(pos, width, height) {
      const x = pos.x - width / 2;
      const y = pos.y - height / 2;
      ctx.moveTo(x, y);
      ctx.lineTo(x + width, y);
      ctx.lineTo(x + width, y + height);
      ctx.lineTo(x, y + height);
      ctx.lineTo(x, y);
    }

    const BORDER_PX = (OUTLINE_PX - INNER_PX) * 2;

    //rect outlines
    ctx.lineWidth = 1;
    ctx.fillStyle = "#292929";
    ctx.beginPath();
    for (let i = 0; i < viewPoints.length; i++) {
      traceRect(viewPoints[i], INNER_PX * 3.5 + BORDER_PX, INNER_PX * 1.3 + BORDER_PX);
    }
    ctx.fill();

    //rect middle
    ctx.fillStyle = active ? "white" : color;
    ctx.beginPath();
    for (let i = 0; i < viewPoints.length; i++) {
      traceRect(viewPoints[i], INNER_PX * 3.5, INNER_PX * 1.3);
    }
    ctx.fill();

    //draw depth scale
    if (drag_point >= 0) {
      const p = viewPoints[drag_point];

      const grad = ctx.createLinearGradient(p.x - 60, p.y, p.x + 25, p.y)
      grad.addColorStop(0.0, "rgba(0, 0, 0, 0.75)");
      grad.addColorStop(1.0, "transparent");
      ctx.fillStyle = grad;
      ctx.fillRect(p.x - 60, icon_bar.offsetHeight, 85, window.innerHeight - icon_bar.offsetHeight)

      ctx.lineWidth = 2;
      ctx.strokeStyle = "white";
      ctx.beginPath();

      //0
      ctx.moveTo(p.x - 60, p.y);
      ctx.lineTo(p.x - 30, p.y);

      const steps = [1, 10, 100, 1000, 10000]
      for (const i of steps) {
        const scaled = stepToLinearScale(i) / 1.25;
        ctx.moveTo(p.x - 60, p.y + scaled);
        ctx.lineTo(p.x, p.y + scaled);

        ctx.moveTo(p.x - 60, p.y - scaled);
        ctx.lineTo(p.x, p.y - scaled);
      }
      ctx.stroke();

      ctx.lineJoin = 'round';
      ctx.miterLimit = 2;
      ctx.font = (12) + "px Monospace";
      ctx.textAlign = "left";
      ctx.fillStyle = "white";

      for (const i of steps) {
        const scaled = stepToLinearScale(i) / 1.25;

        const text = Math.round(drag_point_z + i).toFixed(0);
        const text_neg = Math.round(drag_point_z - i).toFixed(0);

        ctx.fillText(text_neg, p.x - 25, p.y + scaled - 5);
        ctx.fillText(text, p.x - 25, p.y - scaled - 5);
      }

      ctx.lineWidth = 1;
      ctx.strokeStyle = "lightgray";
      ctx.beginPath();
      const micro_steps = [
        0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9,
        1, 2, 3, 4, 5, 6, 7, 8, 9,
        10, 20, 30, 40, 50, 60, 70, 80, 90,
        100, 200, 300, 400, 500, 600, 700, 800, 900,
        1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000
      ]

      for (const i of micro_steps) {
        const scaled = stepToLinearScale(i) / 1.25;
        ctx.moveTo(p.x - 60, p.y + scaled);
        ctx.lineTo(p.x - 30, p.y + scaled);

        ctx.moveTo(p.x - 60, p.y - scaled);
        ctx.lineTo(p.x - 30, p.y - scaled);
      }

      ctx.stroke();

      ctx.lineWidth = 5;
      ctx.strokeStyle = "#446294";
      ctx.beginPath();
      ctx.moveTo(p.x - 60, icon_bar.offsetHeight);
      ctx.lineTo(p.x - 60, window.innerHeight);

      //up arrow
      ctx.moveTo(p.x - 65, icon_bar.offsetHeight + 10);
      ctx.lineTo(p.x - 60, icon_bar.offsetHeight);
      ctx.lineTo(p.x - 55, icon_bar.offsetHeight + 10);

      //down arrow
      ctx.moveTo(p.x - 65, window.innerHeight - 10);
      ctx.lineTo(p.x - 60, window.innerHeight);
      ctx.lineTo(p.x - 55, window.innerHeight - 10);
      ctx.stroke();
    }

  }

  if (mode == "Z")
    drawRectangles();
  else
    drawCircles();

  ctx.font = "bold 12px Monospace";
  ctx.textAlign = "center";
  ctx.fillStyle = "#21252b";

  function formatZ(num) {
    if (num > 0) {
      if (num >= 10000) return "9999";
      if (num >= 100) return Math.floor(num).toString();
      return num.toFixed(1);
    }
    const absnum = Math.abs(num);
    if (absnum >= 10000) return "-9999";
    if (absnum >= 100) return Math.floor(num).toString();
    return num.toFixed(1);
  }
  viewPoints.forEach((pos, index) => {
    if (mode == "Z")
      ctx.fillText(formatZ(points[index].z) + "m", pos.x, pos.y + 5);
    else
      ctx.fillText(index, pos.x, pos.y + 5);
  });
}

export function pointToScreen(point, view, tf, fixed_frame) {
  let transformed = tf.transformPose(
    fixed_frame,
    tf.fixed_frame,
    point,
    new Quaternion()
  );

  return view.fixedToScreen({
    x: transformed.translation.x,
    y: transformed.translation.y
  });
}

export function screenToPoint(click, view, tf, fixed_frame) {
  return tf.transformPose(
    tf.fixed_frame,
    fixed_frame,
    view.screenToFixed(click),
    new Quaternion()
  ).translation;
}

function drawOffsetPath(ctx, viewPoints, offset, startIndex, startClosest) {
  ctx.lineWidth = offset;
  ctx.strokeStyle = "rgba(20,20,20,0.35)";
  ctx.lineCap = "round";

  ctx.beginPath();
  for (let i = 0; i < viewPoints.length - 1; i++) {

    if (startClosest && i < startIndex)
      continue;

    const p1 = viewPoints[i];
    const p2 = viewPoints[i + 1];

    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
  }

  ctx.stroke();
}
