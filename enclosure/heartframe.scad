// =============================================================================
// Heart Frame enclosure - parametric OpenSCAD model (works in OpenSCAD 2021.01+)
//
//   openscad -D 'part="front"'          -o stl/front.stl          heartframe.scad
//   openscad -D 'part="back"'           -o stl/back.stl           heartframe.scad
//   openscad -D 'part="diffuser"' -D 'diffuser_face=1.6' -o stl/diffuser_1.6.stl heartframe.scad
//   openscad -D 'part="test_display"'   -o stl/test_display.stl   heartframe.scad
//   openscad -D 'part="test_boss"'      -o stl/test_boss.stl      heartframe.scad
//   openscad -D 'part="template"'       -o stl/front_template.svg heartframe.scad  (1:1 paper template)
//   (or just run ./export.sh, which also makes the insert drawing for the print shop)
//
// Coordinates: X = left->right, Y = bottom->top, Z = depth (0 = front face,
// increasing towards the back). All sizes in millimetres.
//
// STEP 1: measure YOUR parts with calipers and fill in the "MEASURED" block.
// The defaults are datasheet / typical values and WILL be slightly off.
// =============================================================================

part = "assembly";   // assembly | front | back | diffuser | test_display | test_boss | template | info | front_view | section

/* [MEASURED - e-paper module (Waveshare 4.2" V2)] */
pcb_w = 103.0;       // module PCB width (long side)
pcb_h = 78.5;        // module PCB height
pcb_t = 1.6;         // PCB thickness
panel_w = 90.1;      // glass panel width
panel_h = 77.0;      // glass panel height
panel_t = 1.2;       // glass + tape thickness (front of glass to front of PCB)
panel_x = 1.2;       // panel left edge  - PCB left edge   (MEASURE: looking at the screen side)
panel_y = 0.75;      // panel bottom edge - PCB bottom edge (MEASURE)
aa_w = 84.8;         // active (image) area width
aa_h = 63.6;         // active area height
aa_x = 2.65;         // active area left edge  - panel left edge   (MEASURE: draw a 1-px border with `epd`)
aa_y = 10.4;         // active area bottom edge - panel bottom edge (MEASURE; the FPC side has the wide border)
module_back = 6.0;   // tallest part on the back of the module (connector), from PCB back
fpc_edge = "bottom"; // edge where the flex cable wraps round: bottom | top | left | right
fpc_len = 40;        // length of that flex bulge along the edge
presser_xy = [[6, 6], [97, 6], [6, 72.5], [97, 72.5]]; // pads pressing the module PCB (from PCB lower-left). Keep off parts!

/* [MEASURED - electronics] */
feather_l = 52.3;    // Adafruit ESP32-S3 Feather length incl. the USB-C overhang
feather_pcb_l = 50.8;// PCB alone (2.0")
feather_w = 22.9;
feather_pcb_t = 1.6;
feather_top = 5.8;   // tallest part above the PCB
feather_holes = [[2.54, 2.54], [2.54, 20.32], [48.26, 2.54], [48.26, 20.32]]; // from the PCB corner away from USB-C (MEASURE)
feather_standoff = 4;// gap between back cover and the Feather's underside
usbc_z_on_pcb = 1.6; // USB-C receptacle centre height above the PCB top
batt_d = 18.6;       // 18650 cell (Adafruit #1781: 18 x 69) - add the heat-shrink!
batt_l = 70.0;
led_board_w = 44;    // heart LED perfboard, cut so it covers the light chamber
led_board_h = 40;
led_board_t = 1.6;
led_h = 1.6;         // WS2812B 5050 height
button_hole = 7.2;   // 7 mm panel-mount momentary button
switch_body = [8.7, 3.7, 3.8]; // SS12D00-style slide switch body (L, W, H)
switch_slot = [5.0, 2.2];      // knob slot through the back (travel + knob)

/* [Design] */
wall = 2.4;          // side walls
front_t = 2.4;       // front plate
back_t = 2.2;        // back cover plate
corner_r = 7;        // outer corner radius
edge_r = 2.5;        // rounding of the front edges
fit = 0.3;           // clearance per side for printed-to-part fits (SLA 0.2-0.3, MJF/FDM 0.4-0.5)
win_margin = 0.8;    // window is this much bigger than the active area on each side
win_bevel = 1.2;     // 45-degree bevel on the window's front edge
top_margin = 13;     // space above the module (the top screw bosses live here)
heart_w = 36;        // heart width on the front
heart_gap = 5;       // space between module and heart chamber
bottom_margin = 7;
led_gap = 12;        // LEDs to diffuser: 10-15 mm gives an even glow
baffle_t = 1.6;      // heart light-chamber wall
flange = 1.4;        // diffuser flange overlap behind the front plate
flange_t = 1.0;
diffuser_face = 1.6; // diffuser thickness where the light comes through (see test_diffusers)
battery = "18650";   // 18650 | pouch
pouch = [60, 36, 7.5];   // if battery = "pouch": L, W, T (+ allow 10% swelling!)
fastener = "insert"; // insert (M3 brass insert fitted by the print shop) | nut (M3 nut in a side slot) | selftap (FDM/MJF only)
insert_hole = 4.0;   // JLC3DP insert type 1 "TTH-M3*6.25-HD4.7" wants a 4.0 mm hole, 7.0 mm deep
insert_depth = 7.0;  //   (type 5 "M3*4*5": 3.6 mm x 7.0 mm). JLC also needs >= 3 mm of wall and a flat 14 x 14 mm area.
nut_af = 5.5;        // M3 nut across flats
nut_t = 2.4;         // M3 nut thickness
nut_depth = 5.0;     // nut slot starts this far below the rear face (use M3 x 12 screws with nuts)
foot_depth = 30;     // stand fins behind the frame
foot_height = 45;

$fn = 64;
eps = 0.01;

// ---------------------------------------------------------------- derived
aa_cx_on_pcb = panel_x + aa_x + aa_w / 2;
aa_cy_on_pcb = panel_y + aa_y + aa_h / 2;
half_span = max(aa_cx_on_pcb, pcb_w - aa_cx_on_pcb) + fit;  // keep the window centred left/right
W = 2 * (half_span + wall);
heart_hgt = heart_w * 0.92;
chamber_h = heart_hgt + 2 * (flange + fit + baffle_t);
H = wall + bottom_margin + chamber_h + heart_gap + pcb_h + 2 * fit + top_margin + wall;
pcb_x0 = W / 2 - aa_cx_on_pcb;
pcb_y0 = H - wall - top_margin - fit - pcb_h;
win_cx = W / 2;
win_cy = pcb_y0 + aa_cy_on_pcb;
heart_cx = W / 2;
heart_cy = wall + bottom_margin + chamber_h / 2;

stack_needed = battery == "18650" ? batt_d + 1.5 : pouch[2] + 2;
Df = front_t + panel_t + pcb_t + module_back + max(stack_needed, feather_top + feather_pcb_t + feather_standoff) + 1.5;  // front shell depth
D = Df + back_t;
z_led = front_t + flange_t + led_gap;           // top of the LEDs
z_board_front = z_led + led_h;
z_board_back = z_board_front + led_board_t;
z_pcb_back = front_t + panel_t + pcb_t;

// Screw bosses in the four corners. With inserts they are square corner blocks, so the
// rear face gives the print shop a flat area of 14 x 14 mm round each hole (walls included).
insert_flat = 14;
boss_d = fastener == "nut" ? 10 : 8;            // round bosses (nut / selftap)
boss_hole = fastener == "insert" ? insert_hole : fastener == "nut" ? 3.3 : 2.6;
boss_c = fastener == "insert" ? 7.5 : wall + boss_d / 2 + 0.6;  // hole centre from the two nearest outer edges
boss_pos = [[boss_c, H - boss_c], [W - boss_c, H - boss_c], [boss_c, boss_c], [W - boss_c, boss_c]];
assert(fastener != "insert" || boss_c + insert_flat / 2 < wall + top_margin + fit - 0.5,
       "top_margin too small: the insert blocks would touch the display module");

// Electronics placement on the back cover (X, Y of centres, front view)
batt_cx = W / 2;
batt_cy = pcb_y0 + 16;
feather_x1 = W - wall - 0.5;                    // USB-C face 0.5 mm from the inside of the right wall
feather_x0 = feather_x1 - feather_l;            // left end of the PCB
feather_cy = pcb_y0 + pcb_h - 24;
usb_z = Df - feather_standoff - feather_pcb_t - usbc_z_on_pcb; // Feather on standoffs, parts facing forward
button_x = W - 28;

echo(str("Outer size W x H x D = ", W, " x ", H, " x ", D, " mm"));

// ---------------------------------------------------------------- shapes
module rrect(w, h, r) {
  r2 = min(r, w / 2 - eps, h / 2 - eps);
  translate([r2, r2]) offset(r = r2) square([w - 2 * r2, h - 2 * r2]);
}

// Parametric heart (same curve as the web app), centred, exactly `w` wide
// (16*sin^3 spans 32 units) and 0.9 * w tall.
function heart_pts(w, n = 120) = [
  for (i = [0 : n - 1]) let(t = 360 * i / n, s = w / 32)
    [16 * pow(sin(t), 3) * s, (13 * cos(t) - 5 * cos(2 * t) - 2 * cos(3 * t) - cos(4 * t) + 2.5) * s]
];
module heart2d(w) { polygon(heart_pts(w)); }

// Solid body with rounded front edges (layered hull approximates a fillet).
module body(w, h, d, r, e) {
  steps = 6;
  hull() {
    for (i = [0 : steps]) {
      a = 90 * i / steps;
      inset = e * (1 - sin(a));
      z = e * (1 - cos(a));
      translate([0, 0, z]) linear_extrude(eps) translate([inset, inset]) rrect(w - 2 * inset, h - 2 * inset, r - inset);
    }
    translate([0, 0, e]) linear_extrude(d - e) rrect(w, h, r);
  }
}

module fastener_hole(depth) {
  cylinder(d = boss_hole, h = fastener == "insert" ? insert_depth : depth);
}

// Footprint of one boss (2D, front coordinates), p = hole centre.
module boss2d(p, grow = 0) {
  if (fastener == "insert") {
    // square block from the inside of the walls to 7 mm past the hole centre
    sx = p[0] < W / 2 ? 1 : -1;
    sy = p[1] < H / 2 ? 1 : -1;
    x0 = p[0] - sx * (boss_c - wall + eps);            // inner face of the side wall
    y0 = p[1] - sy * (boss_c - wall + eps);
    x1 = p[0] + sx * insert_flat / 2;
    y1 = p[1] + sy * insert_flat / 2;
    offset(delta = grow) translate([min(x0, x1), min(y0, y1)]) square([abs(x1 - x0), abs(y1 - y0)]);
  } else {
    translate(p) circle(d = boss_d + 2 * grow);
  }
}

// M3 nut slot, entered from the inside of the shell: the nut slides in towards the hole and
// the screw then clamps the boss between the nut and the back cover.
module nut_slot(p) {
  a = atan2(H / 2 - p[1], W / 2 - p[0]);
  ac = (nut_af + 0.3) / cos(30);                    // across corners incl. clearance
  translate([p[0], p[1], Df - nut_depth - nut_t - 0.3]) rotate([0, 0, a])
    hull() { cylinder(d = ac, h = nut_t + 0.3, $fn = 6); translate([boss_d, 0, 0]) cylinder(d = ac, h = nut_t + 0.3, $fn = 6); }
}

// ---------------------------------------------------------------- front shell
module front_shell() {
  difference() {
    union() {
      difference() {
        body(W, H, Df, corner_r, edge_r);
        translate([wall, wall, front_t]) linear_extrude(Df) rrect(W - 2 * wall, H - 2 * wall, corner_r - wall);
      }
      // module locating rim (3 mm tall) around the PCB
      translate([0, 0, front_t - eps]) difference() {
        translate([pcb_x0 - fit - 1.2, pcb_y0 - fit - 1.2]) cube([pcb_w + 2 * fit + 2.4, pcb_h + 2 * fit + 2.4, panel_t + 3]);
        translate([pcb_x0 - fit, pcb_y0 - fit, -1]) cube([pcb_w + 2 * fit, pcb_h + 2 * fit, 10]);
      }
      // heart light chamber (baffle)
      translate([heart_cx, heart_cy, front_t - eps]) linear_extrude(z_board_front - 0.5 - front_t)
        difference() { offset(r = flange + fit + baffle_t) heart2d(heart_w); offset(r = flange + fit) heart2d(heart_w); }
      // screw bosses
      for (p = boss_pos) translate([0, 0, front_t - eps]) linear_extrude(Df - front_t + eps) boss2d(p);
    }
    // display window with a bevelled front edge
    translate([win_cx, win_cy, 0]) {
      hull() {
        translate([0, 0, -eps]) linear_extrude(eps) square([aa_w + 2 * win_margin + 2 * win_bevel, aa_h + 2 * win_margin + 2 * win_bevel], center = true);
        translate([0, 0, win_bevel]) linear_extrude(eps) square([aa_w + 2 * win_margin, aa_h + 2 * win_margin], center = true);
      }
      translate([0, 0, -1]) linear_extrude(front_t + 2) square([aa_w + 2 * win_margin, aa_h + 2 * win_margin], center = true);
    }
    // flex-cable bulge relief in the rim
    fpc_relief();
    // heart opening
    translate([heart_cx, heart_cy, -1]) linear_extrude(front_t + 2) heart2d(heart_w);
    // screw holes in the bosses (from the back)
    for (p = boss_pos) translate([p[0], p[1], Df + eps]) mirror([0, 0, 1]) fastener_hole(Df - front_t - 2);
    if (fastener == "nut") for (p = boss_pos) nut_slot(p);
    // USB-C on the right side
    translate([W - wall - 1, feather_cy, usb_z]) rotate([0, 90, 0]) linear_extrude(wall + 2)
      rrect_centered(7.2, 12.6, 3.0);
    // button on the top
    translate([button_x, H - wall - 4, Df / 2]) rotate([-90, 0, 0]) cylinder(d = button_hole, h = wall + 10);
  }
}

module rrect_centered(w, h, r) { translate([-w / 2, -h / 2]) rrect(w, h, r); }

module fpc_relief() {
  depth = 2.2;
  z0 = front_t - 1;
  if (fpc_edge == "bottom") translate([pcb_x0 + pcb_w / 2 - fpc_len / 2, pcb_y0 - fit - depth, z0]) cube([fpc_len, depth + 1, panel_t + 5]);
  if (fpc_edge == "top") translate([pcb_x0 + pcb_w / 2 - fpc_len / 2, pcb_y0 + pcb_h + fit - 1, z0]) cube([fpc_len, depth + 1, panel_t + 5]);
  if (fpc_edge == "left") translate([pcb_x0 - fit - depth, pcb_y0 + pcb_h / 2 - fpc_len / 2, z0]) cube([depth + 1, fpc_len, panel_t + 5]);
  if (fpc_edge == "right") translate([pcb_x0 + pcb_w + fit - 1, pcb_y0 + pcb_h / 2 - fpc_len / 2, z0]) cube([depth + 1, fpc_len, panel_t + 5]);
}

// ---------------------------------------------------------------- back cover
// Modelled in assembly position (plate from Z = Df to D, features pointing to -Z).
module back_cover() {
  inner_w = W - 2 * wall - 2 * fit;
  inner_h = H - 2 * wall - 2 * fit;
  difference() {
    union() {
      translate([0, 0, Df]) linear_extrude(back_t) rrect(W, H, corner_r);
      // alignment lip
      translate([wall + fit, wall + fit, Df - 3]) difference() {
        linear_extrude(3 + eps) rrect(inner_w, inner_h, corner_r - wall);
        translate([1.2, 1.2, -1]) linear_extrude(5) rrect(inner_w - 2.4, inner_h - 2.4, corner_r - wall - 1.2);
      }
      // module pressers (put 1.5-2 mm EVA foam on top)
      for (p = presser_xy) translate([pcb_x0 + p[0], pcb_y0 + p[1], z_pcb_back + 1.5]) cylinder(d = 6, h = Df - z_pcb_back - 1.5 + eps);
      // battery cradle
      battery_cradle();
      // Feather standoffs (M2.5 x 10 screw from the back + nut on top of the Feather)
      for (h = feather_holes) translate([feather_x0 + h[0], feather_cy - feather_w / 2 + h[1], Df - feather_standoff])
        cylinder(d = 5, h = feather_standoff + eps);
      // LED board platform (hollow)
      translate([heart_cx, heart_cy, z_board_back]) difference() {
        translate([-led_board_w / 2 - 1, -led_board_h / 2 - 1, 0]) cube([led_board_w + 2, led_board_h + 2, Df - z_board_back + eps]);
        translate([-led_board_w / 2 + 2, -led_board_h / 2 + 2, 1.6]) cube([led_board_w - 4, led_board_h - 4, Df]);
        for (s = [-1, 1]) translate([s * (led_board_w / 2 - 3.5), 0, -1]) cylinder(d = 1.8, h = 6); // M2 self-tap pilot holes
      }
      // slide-switch holder
      translate([W / 2 - 22, feather_cy, Df - switch_body[2] - 1.2]) difference() {
        translate([-switch_body[0] / 2 - 1.6, -switch_body[1] / 2 - 1.6, 0]) cube([switch_body[0] + 3.2, switch_body[1] + 3.2, switch_body[2] + 1.2 + eps]);
        translate([-switch_body[0] / 2 - fit, -switch_body[1] / 2 - fit, -1]) cube([switch_body[0] + 2 * fit, switch_body[1] + 2 * fit, switch_body[2] + 1]);
      }
      // stand fins
      for (x = [W * 0.2, W * 0.8]) translate([x - 2, 0, D - eps]) rotate([0, 90, 0]) linear_extrude(4)
        polygon([[0, 0], [-foot_depth, 0], [0, foot_height]]);
    }
    // Feather screw holes through standoffs and plate
    for (h = feather_holes) translate([feather_x0 + h[0], feather_cy - feather_w / 2 + h[1], Df - feather_standoff - 1])
      cylinder(d = 2.8, h = feather_standoff + back_t + 2);
    // countersunk screw holes
    for (p = boss_pos) translate([p[0], p[1], Df - 1]) {
      cylinder(d = 3.4, h = back_t + 2);
      translate([0, 0, back_t + 1 - 1.8]) cylinder(d1 = 3.4, d2 = 6.6, h = 1.8 + eps);
    }
    // lip cut-outs around the bosses
    for (p = boss_pos) translate([0, 0, Df - 4]) linear_extrude(4 + eps) boss2d(p, grow = 0.6);
    // switch knob slot
    translate([W / 2 - 22, feather_cy, Df - 1]) linear_extrude(back_t + 2) square(switch_slot, center = true);
    // vents near the battery (heat and, in the worst case, gas can get out)
    for (i = [-1, 0, 1]) translate([batt_cx + i * 18, batt_cy - 7, Df - 1]) linear_extrude(back_t + 2) rrect_centered(2, 14, 1);
  }
}

module battery_cradle() {
  if (battery == "18650") {
    r = batt_d / 2 + fit;
    for (s = [-1, 1]) translate([batt_cx + s * (batt_l / 2 - 12), batt_cy, Df]) difference() {
      translate([-4, -r - 2, -r - 1]) cube([8, 2 * r + 4, r + 1 + eps]);
      translate([-5, 0, -r - 1]) rotate([0, 90, 0]) cylinder(r = r, h = 10);
      translate([-1.5, -r - 3, -r - 1 + 3]) cube([3, 2 * r + 6, 2]); // strap slot (velcro / zip tie)
    }
    // end stops (wire exit gap at the right end)
    for (s = [-1, 1]) translate([batt_cx + s * (batt_l / 2 + fit + 1), batt_cy, Df - 8]) difference() {
      translate([-1, -6, 0]) cube([2, 12, 8 + eps]);
      if (s > 0) translate([-2, -2.5, -1]) cube([4, 5, 6]);
    }
  } else {
    // pouch: a walled bay with 10 % extra room for swelling and no sharp edges
    translate([batt_cx - pouch[0] / 2 - 1.5 - fit, batt_cy - pouch[1] / 2 - 1.5 - fit, Df - pouch[2] - 1]) difference() {
      cube([pouch[0] + 3 + 2 * fit, pouch[1] + 3 + 2 * fit, pouch[2] + 1 + eps]);
      translate([1.5, 1.5, -1]) cube([pouch[0] + 2 * fit, pouch[1] + 2 * fit, pouch[2] + 3]);
      translate([pouch[0] - 2, pouch[1] / 2 - 3, -1]) cube([10, 6, 20]); // wire exit
    }
  }
}

// ---------------------------------------------------------------- diffuser
module diffuser(face = diffuser_face) {
  // Heart plug: its front sits flush with the front face; the flange behind the
  // front plate stops it from being pushed out. Glue with a drop of clear epoxy or UV resin.
  difference() {
    union() {
      linear_extrude(front_t) offset(delta = -fit) heart2d(heart_w);
      translate([0, 0, front_t]) linear_extrude(flange_t) offset(r = flange) heart2d(heart_w);
    }
    // thin the light-emitting face from behind
    translate([0, 0, face]) linear_extrude(front_t + flange_t) offset(delta = -1.2 - fit) heart2d(heart_w);
  }
}

// ---------------------------------------------------------------- test prints
module test_display() {
  // Front plate + the first 3 mm around the module: checks window alignment and module fit.
  intersection() {
    front_shell();
    translate([pcb_x0 - fit - 6, pcb_y0 - fit - 6, -1]) cube([pcb_w + 2 * fit + 12, pcb_h + 2 * fit + 12, front_t + panel_t + 3 + 1]);
  }
}

module test_boss() {
  // One real corner of the front shell (plate, two walls, boss, hole): checks the insert
  // (or nut) and the screw, and gives the print shop the same flat area as the real part.
  s = boss_c + max(insert_flat / 2, boss_d / 2) + 3;
  intersection() {
    phys() front_shell();
    translate([-1, -1, -1]) cube([s + 1, s + 1, Df + 2]);
  }
}

// 1:1 paper template of the front, as SHE sees it: outline, window, heart, and a thin gap
// where the module's PCB edge is. Print at 100 % and lay it over the running display.
module template2d() {
  difference() {
    rrect(W, H, corner_r);
    translate([win_cx, win_cy]) square([aa_w + 2 * win_margin, aa_h + 2 * win_margin], center = true);
    translate([heart_cx, heart_cy]) heart2d(heart_w);
    translate([pcb_x0, pcb_y0]) difference() { square([pcb_w, pcb_h]); offset(delta = -0.4) square([pcb_w, pcb_h]); }
  }
}

// ---------------------------------------------------------------- output
// Everything above is modelled "as seen from the front" (X = your left -> right
// when you face the screen) but with depth Z pointing away from you, which is a
// mirrored coordinate system. phys() mirrors it back so the printed parts have
// the USB-C port on the RIGHT and the screen offsets exactly as you measured them.
module phys() translate([W, 0, 0]) mirror([1, 0, 0]) children();

// Printable parts are laid flat, outside face down (rotations only, never mirrors).
if (part == "front") phys() front_shell();
else if (part == "back") translate([0, H, D]) rotate([180, 0, 0]) phys() back_cover();
else if (part == "diffuser") diffuser();
else if (part == "test_display") phys() test_display();
else if (part == "test_boss") test_boss();
else if (part == "template") template2d();
else if (part == "info") {
  // read by insert_drawing.py (hole positions as seen from the BACK, i.e. physical X)
  echo(str("HF_INFO W=", W, " H=", H, " D=", D, " Df=", Df, " fastener=", fastener,
           " hole=", boss_hole, " depth=", insert_depth, " c=", boss_c, " flat=", insert_flat, " r=", corner_r));
  cube(0.01);
}
else if (part == "front_view") rotate([0, 180, 0]) phys() front_shell();   // what she sees (for renders)
else if (part != "section" && part != "info" && part != "template") {
  // assembly preview, left half of the shell cut away to show the inside
  phys() {
    color("white") difference() { front_shell(); translate([-1, -1, -1]) cube([W / 2 + 1, H + 2, Df + 2]); }
    color("pink") translate([heart_cx, heart_cy, 0]) diffuser();
    color("lightgrey", 0.9) back_cover();
    color("dimgray") translate([pcb_x0, pcb_y0, front_t + panel_t]) cube([pcb_w, pcb_h, pcb_t]);
    color("black") translate([pcb_x0 + panel_x, pcb_y0 + panel_y, front_t]) cube([panel_w, panel_h, panel_t]);
    color("seagreen") translate([feather_x0, feather_cy - feather_w / 2, Df - feather_standoff - feather_pcb_t]) cube([feather_pcb_l, feather_w, feather_pcb_t]);
    color("silver") translate([feather_x1 - 7.4, feather_cy - 4.5, Df - feather_standoff - feather_pcb_t - 3.2]) cube([7.4, 9, 3.2]);
    if (battery == "18650") color("royalblue") translate([batt_cx - batt_l / 2, batt_cy, Df - batt_d / 2 - 1]) rotate([0, 90, 0]) cylinder(d = batt_d, h = batt_l);
    color("green") translate([heart_cx - led_board_w / 2, heart_cy - led_board_h / 2, z_board_front]) cube([led_board_w, led_board_h, led_board_t]);
  }
}

// Side cross-section through the middle (for checking the depth stack-up in renders).
if (part == "section") intersection() {
  translate([W / 2 - 0.4, -50, -50]) cube([0.8, H + 100, D + 100]);
  phys() union() {
    front_shell();
    back_cover();
    translate([heart_cx, heart_cy, 0]) diffuser();
    translate([pcb_x0, pcb_y0, front_t + panel_t]) cube([pcb_w, pcb_h, pcb_t]);
    translate([pcb_x0 + panel_x, pcb_y0 + panel_y, front_t]) cube([panel_w, panel_h, panel_t]);
    if (battery == "18650") translate([batt_cx - batt_l / 2, batt_cy, Df - batt_d / 2 - 1]) rotate([0, 90, 0]) cylinder(d = batt_d, h = batt_l);
    translate([heart_cx - led_board_w / 2, heart_cy - led_board_h / 2, z_board_front]) cube([led_board_w, led_board_h, led_board_t]);
  }
}
