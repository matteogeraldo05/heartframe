// =============================================================================
// Heart Frame enclosure - parametric OpenSCAD model (works in OpenSCAD 2021.01+)
// v4 (Oct 2026): e-paper only, plain white front, window centred, borders as slim as
// the module allows. Nothing on the top or sides but the USB-C port (a slim-plug opening
// with an inner sleeve, so all you see through it is the port). The push button sits flush
// in a finger dish in the back cover (captive nut), the perfboard is screwed to four posts
// (M2 screws into captive nuts), there is no on/off switch (the firmware watchdog covers
// restarts) and the stand is a separate part the frame slides into.
//
//   openscad -D 'part="front"'          -o stl/front.stl          heartframe.scad
//   openscad -D 'part="back"'           -o stl/back.stl           heartframe.scad
//   openscad -D 'part="test_usb"'       -o stl/test_usb.stl       heartframe.scad
//   openscad -D 'part="test_display"'   -o stl/test_display.stl   heartframe.scad
//   openscad -D 'part="test_boss"'      -o stl/test_boss.stl      heartframe.scad
//   openscad -D 'part="test_button"'    -o stl/test_button.stl    heartframe.scad
//   openscad -D 'part="stand"'          -o stl/stand.stl          heartframe.scad
//   openscad -D 'part="template"'       -o stl/front_template.svg heartframe.scad  (1:1 paper template)
//   (or just run ./export.sh, which also makes the insert drawing for the print shop,
//    and ./export_blender.sh for a Blender scene of the whole thing)
//
// Coordinates: X = left->right, Y = bottom->top, Z = depth (0 = front face,
// increasing towards the back). All sizes in millimetres.
//
// STEP 1: measure YOUR parts with calipers and fill in the "MEASURED" block.
// The defaults are datasheet / typical values and WILL be slightly off.
// =============================================================================

part = "assembly";   // assembly | front | back | stand | test_usb | test_display | test_boss | test_button | template | info | front_view | inside | section

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
presser_xy = [[5, 6], [87, 6], [6, 72.5], [97, 76]]; // pads pressing the module PCB (from PCB lower-left), placed to miss
                     // the battery, the perfboard and the corner blocks. Keep them off parts on the module's back!
presser_d = 5;
// If the module has standoffs on its back, the back cover presses on THEM instead of the PCB
// (no screws into the case needed): set their length and where they are.
epd_standoff_len = 0;   // standoff length below the PCB's back (0 = no standoffs: use presser_xy)
epd_standoff_xy = [[3, 3], [100, 3], [3, 75.5], [100, 75.5]]; // centres from the PCB's lower-left, seen from the SCREEN side (MEASURE)
epd_post_pad = 1.0;     // rubber or EVA pad on top of each post

/* [MEASURED - electronics] */
feather_l = 52.3;    // Adafruit ESP32-S3 Feather length incl. the USB-C overhang
feather_pcb_l = 50.8;// PCB alone (2.0")
feather_w = 22.9;
feather_pcb_t = 1.6;
feather_top = 5.8;   // tallest part above the PCB
usbc_z_on_pcb = 1.6; // USB-C receptacle centre height above the PCB top
usbc_overhang = feather_l - feather_pcb_l;  // USB-C face beyond the Feather's PCB edge
pb_w = 70.0;         // perfboard (5 x 7 cm double-sided), long side (MEASURE)
pb_h = 50.0;         // short side (MEASURE)
pb_t = 1.6;
pb_usb_inset = 0.5;  // USB-C face this far INSIDE the board's right edge (MEASURE once soldered; negative = sticks out)
pb_feather_cy = 21.2;// Feather centre line above the board's bottom edge: headers in rows 4 and 12 of an 18 x 24 hole board (MEASURE)
header_gap = 2.5;    // black plastic header spacer: board top to Feather underside
pb_standoff = 6;     // board underside above the back cover (= post height): room for solder tails and the USB link wire
pb_hole_dx = 66.0;   // perfboard mounting holes, centre to centre along the long side
pb_hole_dy = 46.4;   //   ... and along the short side (holes are 2 mm: M2 screws)
pb_post_d = 7.0;     // posts the board screws onto: M2 x 8 screws into M2 nuts held in the posts
pb_screw_d = 2.4;    // M2 clearance hole
pb_nut_af = 4.0;     // M2 hex nut across flats (ISO 4032)
pb_nut_t = 1.6;      //   ... and thickness
pb_nut_z = 3.0;      // nut slot starts this far below the post top
batt_d = 18.6;       // 18650 cell (Adafruit #1781: 18 x 69) - add the heat-shrink!
batt_l = 70.0;
// Push button: 7 mm panel-mount momentary, normally open (your datasheet). MEASURE the two marked values.
btn_cap_d = 5.6;          // cap diameter
btn_cap_h = 3.5;          // cap height above the threaded bushing
btn_thread_d = 6.7;       // bushing thread, outside diameter
btn_cap_to_flange = 12.4; // cap top -> the shoulder the nut tightens against (20.7 - 8.3 on the datasheet) (MEASURE)
btn_flange_d = 9.5;       // that shoulder (Blender only)
btn_body_d = 7.2;         // body below the shoulder
btn_body_l = 8.3;
btn_term_l = 6.5;         // solder lugs
btn_nut_af = 9.8;         // hex nut across flats
btn_nut_t = 2.0;          // hex nut thickness (MEASURE)
btn_layer = 2.0;          // plastic clamped between the shoulder and the nut
btn_recess = 0;           // cap top this far below the back surface (0 = exactly flush)
btn_dish_d = 20;          // finger dish round the cap: wide and deep enough for a fingertip to push
btn_dish_depth = 3.6;     //   the cap its full travel (btn_cap_h) down into the dish floor
btn_lug_r = 2.75;         // the lugs end up anywhere within this radius (the button is screwed in, any angle)
btn_back_r = 9.5;         // solid backing behind the dish
btn_edge = 2.5;           // dish edge to the top edge of the back

/* [Design] */
wall = 2.4;          // side walls
front_t = 2.4;       // front plate
back_t = 2.2;        // back cover plate
corner_r = 7;        // outer corner radius
edge_r = 2.5;        // rounding of the front edges
fit = 0.3;           // clearance per side for printed-to-part fits (SLA 0.2-0.3, MJF/FDM 0.4-0.5)
win_margin = 0.8;    // window is this much bigger than the active area on each side
win_bevel = 1.2;     // 45-degree bevel on the window's front edge
usb_open = [12.6, 7.0]; // USB-C opening: the plug's plastic body has to come in until it nearly touches the
                     // port (the port sits ~3 mm behind the outside), so this fits slim plugs up to ~12.2 x 6.6 mm
usb_r = 3.0;         // its corner radius
usb_chamfer = 0.6;   // 45-degree lead-in on the outside so the plug finds the hole
usb_rc = [8.94, 3.26];  // the Feather's USB-C receptacle, width x height
usb_sleeve = true;   // a sleeve inside that hugs the receptacle, so you can't see past it into the frame
usb_clr = 0.4;       // sleeve clearance round the receptacle
battery = "18650";   // 18650 | pouch
pouch = [60, 36, 7.5];   // if battery = "pouch": L, W, T (+ allow 10% swelling!)
fastener = "insert"; // insert (M3 brass insert fitted by the print shop) | nut (M3 nut in a side slot) | selftap (FDM/MJF only)
insert_hole = 4.0;   // JLC3DP insert type 1 "TTH-M3*6.25-HD4.7" wants a 4.0 mm hole, 7.0 mm deep
insert_depth = 7.0;  //   (type 5 "M3*4*5": 3.6 mm x 7.0 mm). JLC also needs >= 3 mm of wall and a flat 14 x 14 mm area.
nut_af = 5.5;        // M3 nut across flats
nut_t = 2.4;         // M3 nut thickness
nut_depth = 5.0;     // nut slot starts this far below the rear face (use M3 x 12 screws with nuts)
boss_len = 12;       // corner screw blocks hang this far in from the rear face (clear of the display module)
// Separate stand: the frame's bottom edge slides into its groove (lift it out to lay it flat or hang it).
stand_tilt = 12;     // lean back, degrees
stand_len = 80;      // along the bottom edge (centred)
stand_fit = 0.4;     // groove clearance per side
stand_lip = 7;       // front lip height above the groove floor (covers part of the bottom border only)
stand_back = 30;     // back support height
stand_wall = 3;
stand_floor = 3;
stand_foot = 22;     // base extends this far behind the back support

$fn = 64;
eps = 0.01;

// ---------------------------------------------------------------- derived
aa_cx_on_pcb = panel_x + aa_x + aa_w / 2;
aa_cy_on_pcb = panel_y + aa_y + aa_h / 2;
half_span = max(aa_cx_on_pcb, pcb_w - aa_cx_on_pcb) + fit;  // keep the window centred left/right
W = 2 * (half_span + wall);
// Height: the window is centred top to bottom. The active area sits above the module's
// centre (the flex side has the wide border), so the module sits a little low in the frame.
// The frame is as short as the module allows, plus what the button needs: it lives in the
// top border, outside the module, so its solder lugs can't touch anything on the module's back.
half_win = max(aa_cy_on_pcb, pcb_h - aa_cy_on_pcb);
btn_dy = fit + btn_lug_r + 0.3;                  // button axis above the module's top edge
H = max(2 * (half_win + fit + wall),
        2 * (pcb_h - aa_cy_on_pcb + btn_dy + max(btn_back_r + wall + fit, btn_dish_d / 2 + btn_edge)));
pcb_x0 = W / 2 - aa_cx_on_pcb;
pcb_y0 = H / 2 - aa_cy_on_pcb;
win_cx = W / 2;
win_cy = pcb_y0 + aa_cy_on_pcb;

stack_needed = battery == "18650" ? batt_d + 1.5 : pouch[2] + 2;
board_stack = pb_standoff + pb_t + header_gap + feather_pcb_t + feather_top;   // back cover -> top of the Feather's parts
Df = front_t + panel_t + pcb_t + module_back + max(stack_needed, board_stack) + 1.5;  // front shell depth
D = Df + back_t;
z_pcb_back = front_t + panel_t + pcb_t;

// Screw bosses in the four corners. With inserts they are square corner blocks, so the
// rear face gives the print shop a flat area of 14 x 14 mm round each hole (walls included).
insert_flat = 14;
boss_d = fastener == "nut" ? 10 : 8;            // round bosses (nut / selftap)
boss_hole = fastener == "insert" ? insert_hole : fastener == "nut" ? 3.3 : 2.6;
boss_c = fastener == "insert" ? 7.5 : wall + boss_d / 2 + 0.6;  // hole centre from the two nearest outer edges
boss_pos = [[boss_c, H - boss_c], [W - boss_c, H - boss_c], [boss_c, boss_c], [W - boss_c, boss_c]];
boss_s = boss_c + max(fastener == "insert" ? insert_flat : boss_d, 0) / 2;  // corner block size from the outer corner
// The corner blocks only hang down from the rear face, so they pass over the module's corners.
assert(Df - boss_len > z_pcb_back + module_back + 1, "the corner screw blocks reach the display module");

// Electronics placement on the back cover (X, Y front view). The battery lies low and
// centred, the perfboard (Feather on top, parts facing forward) sits right above it
// against the right wall, and the button is above both, in the top border.
batt_cx = W / 2;
batt_cy = wall + fit + 1.2 + batt_d / 2 + fit + 2 + 0.6;   // cradle just clears the back cover's lip
batt_top = batt_cy + batt_d / 2 + fit + 2;      // top of the cradle
pb_x1 = W - wall - fit;                         // board's right edge, just inside the right wall
pb_x0 = pb_x1 - pb_w;
pb_y0 = batt_top + 1.8;                         // just above the battery cradle
pb_y1 = pb_y0 + pb_h;
feather_x1 = pb_x1 - pb_usb_inset;              // USB-C face
feather_x0 = feather_x1 - feather_l;            // left end of the Feather incl. connector
feather_cy = pb_y0 + pb_feather_cy;
z_pb_back = Df - pb_standoff;                   // board underside
usb_z = z_pb_back - pb_t - header_gap - feather_pcb_t - usbc_z_on_pcb;
pb_holes = [for (sx = [-1, 1], sy = [-1, 1]) [pb_x0 + pb_w / 2 + sx * pb_hole_dx / 2, pb_y0 + pb_h / 2 + sy * pb_hole_dy / 2]];

// Button: in the back cover, centred, behind the top border (nothing else lives there).
btn_core = 15;                                   // square block round the nut, on the inside of the back cover
btn_x = W / 2;
btn_y = pcb_y0 + pcb_h + btn_dy;                 // just above the display module's top edge
z_btn_top = D - btn_recess;                      // cap top
z_btn_flange = z_btn_top - btn_cap_to_flange;    // shoulder face (the boss starts here)
z_btn_nut = z_btn_flange + btn_layer;            // nut sits on the clamped layer
z_btn_bushing = z_btn_top - btn_cap_h;           // top of the threaded bushing
z_btn_tips = z_btn_flange - btn_body_l - btn_term_l;

function dist_rect(p, r) = norm([max(r[0] - p[0], 0, p[0] - r[2]), max(r[1] - p[1], 0, p[1] - r[3])]);
presser_pts = [for (p = presser_xy) [pcb_x0 + p[0], pcb_y0 + p[1]]];
batt_rect = [batt_cx - batt_l / 2 - fit - 2, batt_cy - batt_d / 2 - fit - 2, batt_cx + batt_l / 2 + fit + 2, batt_top];
pb_rect = [pb_x0, pb_y0 - (pb_post_d / 2 - (pb_h - pb_hole_dy) / 2), pb_x1, pb_y1 + (pb_post_d / 2 - (pb_h - pb_hole_dy) / 2)];
corner_rects = [[0, 0, boss_s, boss_s], [W - boss_s, 0, W, boss_s], [0, H - boss_s, boss_s, H], [W - boss_s, H - boss_s, W, H]];
_c1 = [for (p = presser_pts) assert(dist_rect(p, pb_rect) > presser_d / 2 + 0.5, "a module presser is under the perfboard") 0];
_c2 = [for (p = presser_pts) assert(dist_rect(p, batt_rect) > presser_d / 2 + 0.5, "a module presser hits the battery cradle") 0];
_c3 = [for (p = presser_pts, r = corner_rects) assert(dist_rect(p, r) > presser_d / 2 + 0.5, "a module presser hits a corner block") 0];
_c4 = [for (r = corner_rects) assert(dist_rect([pb_rect[0], pb_rect[1]], r) > 0.5 && dist_rect([pb_rect[2], pb_rect[3]], r) > 0.5 && dist_rect([pb_rect[2], pb_rect[1]], r) > 0.5, "the perfboard hits a corner block") 0];
assert(pb_y1 + 0.5 < btn_y - btn_core / 2, "the perfboard runs into the button block");
assert(pb_nut_z + pb_nut_t + 0.3 < pb_standoff - 0.8, "the perfboard nut slot is too close to the back plate");
assert(z_btn_nut + btn_nut_t + 0.6 < z_btn_bushing - 0.5, "the button's nut doesn't fit on its thread below the cap");
assert(z_btn_nut + btn_nut_t + 0.6 < Df - 0.5, "the button's nut slot runs into the back plate");
assert(z_btn_tips > front_t + panel_t + 3 + 0.5, "the button's solder lugs hit the front shell");
// The boss and body sit far behind the module; only the lugs reach down towards it.
assert(z_btn_flange - btn_body_l > z_pcb_back + module_back + 1 || btn_y - btn_body_d / 2 > pcb_y0 + pcb_h + fit + 1, "the button's body hits the display module");
assert(btn_y - btn_lug_r > pcb_y0 + pcb_h + fit || z_btn_tips > z_pcb_back + module_back + 1, "the button's lugs hit the display module");
// Finger dish: the floor at the cap's hole hides the bushing, and a fingertip can push the cap
// its full travel (to the bushing) without having to reach more than ~0.5 mm into that hole.
btn_dish_R = (btn_dish_d * btn_dish_d / 4 + btn_dish_depth * btn_dish_depth) / (2 * btn_dish_depth);
btn_hole_r = btn_cap_d / 2 + 0.4;
z_btn_floor = D - btn_dish_depth + (btn_dish_R - sqrt(btn_dish_R * btn_dish_R - btn_hole_r * btn_hole_r));
assert(btn_dish_d == 0 || z_btn_floor > z_btn_bushing + 0.1, "the dish is so deep the bushing shows");
assert(btn_dish_d == 0 || z_btn_floor - z_btn_bushing < 0.6, "the dish is too shallow to press the cap all the way");
assert(btn_y + btn_back_r <= H - wall - fit + 0.01, "the button's dish backing runs into the alignment lip");
assert(pb_y0 > batt_cy + batt_d / 2 + fit + 2 + 1, "the perfboard overlaps the battery cradle");

echo(str("Outer size W x H x D = ", W, " x ", H, " x ", D, " mm"));
echo(str("Borders: sides ", W / 2 - (aa_w / 2 + win_margin), ", top/bottom ", H / 2 - (aa_h / 2 + win_margin), " mm (window centred at y ", win_cy, " of ", H, ")"));
echo(str("Button: y ", btn_y, ", cap ", btn_recess, " mm below the back surface, dish floor at the cap ", D - z_btn_floor, " mm deep, full travel ", btn_cap_h, " mm, lug tips ", z_btn_tips, " mm behind the front face"));
echo(str("USB-C face to inner wall: ", W - wall - feather_x1, " mm, USB-C centre ", usb_z, " mm behind the front face"));

// ---------------------------------------------------------------- shapes
module rrect(w, h, r) {
  r2 = min(r, w / 2 - eps, h / 2 - eps);
  translate([r2, r2]) offset(r = r2) square([w - 2 * r2, h - 2 * r2]);
}


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
      // screw bosses
      for (p = boss_pos) hanging_boss(p);
      // sleeve round the USB-C receptacle
      if (usb_sleeve) usb_sleeve_add();
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
    // screw holes in the bosses (from the back)
    for (p = boss_pos) translate([p[0], p[1], Df + eps]) mirror([0, 0, 1]) fastener_hole(boss_len - 2);
    if (fastener == "nut") for (p = boss_pos) nut_slot(p);
    // USB-C on the right side
    usb_cut();
    if (usb_sleeve) usb_sleeve_cut();
  }
}

module rrect_centered(w, h, r) { translate([-w / 2, -h / 2]) rrect(w, h, r); }

// A corner screw block that hangs from the rear face only (so it passes over the display
// module's corners), with a 45-degree gusset into the corner underneath so it prints
// without supports and the walls carry it.
module hanging_boss(p) {
  z1 = Df - boss_len;
  sx = p[0] < W / 2 ? 0 : W;
  sy = p[1] < H / 2 ? 0 : H;
  translate([0, 0, z1]) linear_extrude(Df - z1 + eps) boss2d(p);
  intersection() {
    hull() {
      translate([0, 0, z1]) linear_extrude(eps) boss2d(p);
      translate([sx, sy, z1 - boss_s + wall]) cube([2 * wall, 2 * wall, eps], center = true);
    }
    linear_extrude(Df) rrect(W, H, corner_r);   // stay inside the rounded outer corner
  }
}

// USB-C: a sleeve on the inside of the right wall. Its front part keeps the plug-body
// opening right up to the receptacle's face, then it closes in round the receptacle itself
// (open towards the back, so the board drops in), so looking in you see only the port.
module usb_sleeve_add() {
  x0 = feather_x1 - usbc_overhang + 0.3;           // just clear of the Feather's PCB end
  translate([x0, feather_cy - usb_open[0] / 2 - 1.2, usb_z - usb_open[1] / 2 - 1.2])
    cube([W - wall - x0 + eps, usb_open[0] + 2.4, usb_open[1] + 1.6]);
}
module usb_sleeve_cut() {
  x0 = feather_x1 - usbc_overhang + 0.3;
  // plug-body tunnel from the wall to the receptacle face
  translate([feather_x1 - eps, feather_cy, usb_z]) rotate([0, 90, 0]) linear_extrude(W - wall - feather_x1 + 2 * eps)
    rrect_centered(usb_open[1], usb_open[0], usb_r);
  // channel round the receptacle, open towards the back
  translate([x0 - 1, feather_cy - usb_rc[0] / 2 - usb_clr, usb_z - usb_rc[1] / 2 - usb_clr])
    cube([feather_x1 - x0 + 1 + eps, usb_rc[0] + 2 * usb_clr, usb_open[1] + 10]);
}

// Opening sized for the plug's body (not just the metal tip), so the plug can go
// in past the wall and seat fully, plus a 45-degree lead-in on the outside.
module usb_cut() {
  translate([W - wall - 1, feather_cy, usb_z]) rotate([0, 90, 0]) linear_extrude(wall + 2)
    rrect_centered(usb_open[1], usb_open[0], usb_r);
  translate([W, feather_cy, usb_z]) rotate([0, 90, 0]) hull() {
    translate([0, 0, -usb_chamfer]) linear_extrude(eps) rrect_centered(usb_open[1], usb_open[0], usb_r);
    linear_extrude(1) rrect_centered(usb_open[1] + 2 * usb_chamfer, usb_open[0] + 2 * usb_chamfer, usb_r + usb_chamfer);
  }
}

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
      // module pressers (put 1.5-2 mm EVA foam on top), or posts that press on its standoffs
      if (epd_standoff_len > 0) epd_posts();
      else for (p = presser_xy) translate([pcb_x0 + p[0], pcb_y0 + p[1], z_pcb_back + 1.5]) cylinder(d = presser_d, h = Df - z_pcb_back - 1.5 + eps);
      // push button: block round the captive nut, and a solid disc behind the finger dish
      translate([btn_x, btn_y, z_btn_flange]) linear_extrude(Df - z_btn_flange + eps) rrect_centered(btn_core, btn_core, 2);
      translate([btn_x, btn_y, D - btn_dish_depth - 1.2]) cylinder(r = btn_back_r, h = Df - (D - btn_dish_depth - 1.2) + eps);
      // battery cradle
      battery_cradle();
      // perfboard: four posts, M2 screws through its corner holes into captive nuts
      board_mount();
    }
    // countersunk screw holes
    for (p = boss_pos) translate([p[0], p[1], Df - 1]) {
      cylinder(d = 3.4, h = back_t + 2);
      translate([0, 0, back_t + 1 - 1.8]) cylinder(d1 = 3.4, d2 = 6.6, h = 1.8 + eps);
    }
    // lip cut-outs around the bosses
    for (p = boss_pos) translate([0, 0, Df - 4]) linear_extrude(4 + eps) boss2d(p, grow = 0.6);
    button_cut();
    // perfboard screws: clearance hole and a side slot for the nut
    for (p = pb_holes) translate([p[0], p[1], Df - pb_standoff - eps]) {
      cylinder(d = pb_screw_d, h = pb_standoff + 0.6);
      dir = p[0] < pb_x0 + pb_w / 2 ? 1 : -1;
      translate([0, 0, pb_nut_z]) hull() for (dx = [0, dir * pb_post_d]) translate([dx, 0, 0])
        cylinder(d = (pb_nut_af + 0.3) / cos(30), h = pb_nut_t + 0.3, $fn = 6);
    }
    if (epd_standoff_len > 0) for (p = epd_standoff_xy)  // room for a male stud on the standoff's end
      translate([pcb_x0 + p[0], pcb_y0 + p[1], z_pcb_back + epd_standoff_len + epd_post_pad - eps]) cylinder(d = 3.6, h = 5);
    // vents near the battery (heat and, in the worst case, gas can get out)
    for (i = [-1, 0, 1]) translate([batt_cx + i * 18, batt_cy - 7, Df - 1]) linear_extrude(back_t + 2) rrect_centered(2, 14, 1);
  }
}

// Four posts under the perfboard's mounting holes. An M2 nut slides into each post from
// the side (the slot faces the middle of the board, so the board itself stops the nut
// falling out) and an M2 x 8 screw goes through the board into it: no self-tapping
// screws in brittle resin. The right-hand posts are trimmed flush with the board's right
// edge, which sits against the alignment lip.
module board_mount() intersection() {
  for (p = pb_holes) translate([p[0], p[1], Df - pb_standoff]) cylinder(d = pb_post_d, h = pb_standoff + eps);
  translate([wall + fit, wall + fit, 0]) cube([W - 2 * (wall + fit), H - 2 * (wall + fit), D]);
}

// Posts that press on the display module's standoffs (only when epd_standoff_len > 0).
module epd_posts() for (p = epd_standoff_xy) {
  z0 = z_pcb_back + epd_standoff_len + epd_post_pad;
  translate([pcb_x0 + p[0], pcb_y0 + p[1], z0]) cylinder(d = 7, h = Df - z0 + eps);
}

// The push button, from the outside in: a finger dish (the cap's top is flush with the
// back, and the dish lets a fingertip push it its full travel), the cap's hole, room for
// the threaded bushing, a slot the hex nut slides into from the side (it can't turn in
// there, so the button screws into it), and the clamped layer the shoulder sits on.
module button_cut() translate([btn_x, btn_y, 0]) {
  if (btn_dish_d > 0) {
    R = (btn_dish_d * btn_dish_d / 4 + btn_dish_depth * btn_dish_depth) / (2 * btn_dish_depth);
    translate([0, 0, D - btn_dish_depth + R]) sphere(r = R, $fn = 160);
  }
  translate([0, 0, z_btn_bushing + 0.2]) cylinder(r = btn_hole_r, h = D - z_btn_bushing);
  translate([0, 0, z_btn_nut]) cylinder(d = btn_thread_d + 0.6, h = z_btn_bushing + 0.2 - z_btn_nut + eps);
  // nut slot opens sideways (towards the frame's middle), clear of the perfboard below
  translate([0, 0, z_btn_nut]) hull() for (dx = [0, -btn_core]) translate([dx, 0, 0])
    cylinder(d = (btn_nut_af + 0.4) / cos(30), h = btn_nut_t + 0.6, $fn = 6);
  translate([0, 0, z_btn_flange - 1]) cylinder(d = btn_thread_d + 0.4, h = btn_layer + 1 + eps);
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

// ---------------------------------------------------------------- test prints
module test_display() {
  // Front plate + the first 3 mm around the module: checks window alignment and module fit.
  intersection() {
    front_shell();
    translate([pcb_x0 - fit - 6, pcb_y0 - fit - 6, -1]) cube([pcb_w + 2 * fit + 12, pcb_h + 2 * fit + 12, front_t + panel_t + 3 + 1]);
  }
}

module test_usb() {
  // The right wall around the USB-C opening plus the two posts under the board's right
  // end: print it, screw your soldered board on and try your cable before the full print.
  // (Cut in model coordinates, then mirrored like the real parts.)
  phys() intersection() {
    union() { front_shell(); back_cover(); }
    translate([W - (pb_w * 0.35) - 4, pb_y0 - 6, -1]) cube([pb_w * 0.35 + 5, pb_h + 12, D + 2]);
  }
}

module test_button() {
  // The button corner of the back cover: checks that the nut slides in, the button
  // screws in, and the cap ends up flush.
  intersection() {
    back_cover();
    translate([btn_x - btn_back_r - 3, btn_y - btn_back_r - 3, z_btn_flange - 1]) cube([2 * btn_back_r + 6, 2 * btn_back_r + 6, D - z_btn_flange + 2]);
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

// The stand: a separate wedge the frame's bottom edge slides into, leaning it back by
// stand_tilt. Profile in (h = towards the back, t = up), extruded along the frame's width.
stand_g = D + 2 * stand_fit;                                                   // groove width
stand_hb = (stand_g + stand_wall) * cos(stand_tilt) + stand_floor * sin(stand_tilt) + 1;  // groove's back-bottom corner
module stand2d() difference() {
  hull() {
    square([stand_hb + stand_wall + stand_foot, stand_floor]);
    translate([stand_hb, stand_floor]) rotate(-stand_tilt) {
      translate([-stand_g - stand_wall, -stand_floor]) square([stand_wall, stand_floor + stand_lip]);
      translate([0, -stand_floor]) square([stand_wall, stand_floor + stand_back]);
    }
  }
  translate([stand_hb, stand_floor]) rotate(-stand_tilt) translate([-stand_g, 0]) square([stand_g, stand_back + 20]);
}
module stand() linear_extrude(stand_len) offset(r = 0.8) offset(delta = -0.8) stand2d();
// The stand placed where it holds the frame (model coordinates): undo the tilt, then map
// (h, t, along) -> (Z, Y, X).
module stand_in_place()
  multmatrix([[0, 0, 1, (W - stand_len) / 2], [0, 1, 0, -stand_floor], [1, 0, 0, D + stand_fit - stand_hb], [0, 0, 0, 1]])
    translate([stand_hb, stand_floor, 0]) rotate([0, 0, stand_tilt]) translate([-stand_hb, -stand_floor, 0]) stand();

// 1:1 paper template of the front, as SHE sees it: outline, window, and a thin gap
// where the module's PCB edge is. Print at 100 % and lay it over the running display.
module template2d() {
  difference() {
    rrect(W, H, corner_r);
    translate([win_cx, win_cy]) square([aa_w + 2 * win_margin, aa_h + 2 * win_margin], center = true);
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
else if (part == "test_usb") rotate([0, -90, 0]) test_usb();  // the wall flat on the bed
else if (part == "test_display") phys() test_display();
else if (part == "test_boss") test_boss();
else if (part == "test_button") translate([0, H, D]) rotate([180, 0, 0]) phys() test_button();  // outside face down
else if (part == "stand") stand();                                         // profile flat on the bed
else if (part == "template") template2d();
else if (part == "info") {
  // read by insert_drawing.py (hole positions as seen from the BACK, i.e. physical X)
  echo(str("HF_INFO W=", W, " H=", H, " D=", D, " Df=", Df, " fastener=", fastener,
           " hole=", boss_hole, " depth=", insert_depth, " c=", boss_c, " flat=", insert_flat, " r=", corner_r));
  cube(0.01);
}
else if (part == "front_view") rotate([0, 180, 0]) phys() front_shell();   // what she sees (for renders)
else if (part == "inside") rotate([0, 180, 0]) phys_view();                // back cover + electronics, seen from the front
// Separate parts in assembled position for the Blender scene (./export_blender.sh).
else if (part == "bl_info") {
  echo(str("HF_BL W=", W, " H=", H, " D=", D, " Df=", Df, " front_t=", front_t, " win_cx=", win_cx, " win_cy=", win_cy,
           " aa_w=", aa_w, " aa_h=", aa_h, " win_margin=", win_margin, " stand_tilt=", stand_tilt));
  cube(0.01);
}
else if (part == "bl_front") phys() front_shell();
else if (part == "bl_back") phys() back_cover();
else if (part == "bl_panel") phys() el_panel();
else if (part == "bl_module") phys() el_module();
else if (part == "bl_perfboard") phys() el_perfboard();
else if (part == "bl_headers") phys() el_headers();
else if (part == "bl_feather") phys() el_feather();
else if (part == "bl_usbc") phys() el_usbc();
else if (part == "bl_battery") phys() el_battery();
else if (part == "bl_button_body") phys() el_button_body();
else if (part == "bl_button_nut") phys() el_button_nut();
else if (part == "bl_button_cap") phys() el_button_cap();
else if (part == "bl_stand") phys() stand_in_place();
else if (part != "section" && part != "info" && part != "template" && part != "inside" && part != "none") {
  // assembly preview, left half of the shell cut away to show the inside
  phys() {
    color("white") difference() { front_shell(); translate([-1, -1, -1]) cube([W / 2 + 1, H + 2, Df + 2]); }
    color("lightgrey", 0.9) back_cover();
    color("dimgray") translate([pcb_x0, pcb_y0, front_t + panel_t]) cube([pcb_w, pcb_h, pcb_t]);
    color("black") translate([pcb_x0 + panel_x, pcb_y0 + panel_y, front_t]) cube([panel_w, panel_h, panel_t]);
    electronics();
    if (battery == "18650") color("royalblue") translate([batt_cx - batt_l / 2, batt_cy, Df - batt_d / 2 - 1]) rotate([0, 90, 0]) cylinder(d = batt_d, h = batt_l);
  }
}

// Perfboard + Feather (for previews and the section only).
module el_perfboard() translate([pb_x0, pb_y0, z_pb_back - pb_t]) cube([pb_w, pb_h, pb_t]);
module el_headers() translate([feather_x1 - feather_l + 6, feather_cy - feather_w / 2 + 0.6, z_pb_back - pb_t - header_gap])
  for (dy = [0, feather_w - 3.7]) translate([0, dy, 0]) cube([40.6, 2.5, header_gap]);
module el_feather() translate([feather_x1 - usbc_overhang - feather_pcb_l, feather_cy - feather_w / 2, z_pb_back - pb_t - header_gap - feather_pcb_t])
  cube([feather_pcb_l, feather_w, feather_pcb_t]);
module el_usbc() translate([feather_x1 - 7.4, feather_cy - 4.5, usb_z - 1.6]) cube([7.4, 9, 3.2]);
module electronics() {
  color("darkolivegreen") el_perfboard();
  color("black") el_headers();
  color("seagreen") el_feather();
  color("silver") el_usbc();
}

// Simple stand-ins for the parts the shells hold (Blender scene only).
module el_battery() translate([batt_cx - batt_l / 2, batt_cy, Df - batt_d / 2 - 1]) rotate([0, 90, 0]) cylinder(d = batt_d, h = batt_l);
module el_panel() translate([pcb_x0 + panel_x, pcb_y0 + panel_y, front_t]) cube([panel_w, panel_h, panel_t]);
module el_module() translate([pcb_x0, pcb_y0, front_t + panel_t]) cube([pcb_w, pcb_h, pcb_t]);
// The push button in its boss: body, shoulder, threaded bushing and lugs; the nut; the cap.
module el_button_body() translate([btn_x, btn_y, 0]) {
  translate([0, 0, z_btn_flange - btn_body_l]) cylinder(d = btn_body_d, h = btn_body_l - 1);
  translate([0, 0, z_btn_flange - 1]) cylinder(d = btn_flange_d, h = 1);
  translate([0, 0, z_btn_flange]) cylinder(d = btn_thread_d, h = btn_cap_to_flange - btn_cap_h);
  for (sx = [-1, 1]) translate([sx * 1.75 - 1, -0.25, z_btn_tips]) cube([2, 0.5, btn_term_l + 0.5]);
}
module el_button_nut() translate([btn_x, btn_y, z_btn_nut]) difference() {
  cylinder(d = btn_nut_af / cos(30), h = btn_nut_t, $fn = 6);   // flats along the slot, as it slides in
  translate([0, 0, -1]) cylinder(d = btn_thread_d, h = btn_nut_t + 2);
}
module el_button_cap() translate([btn_x, btn_y, z_btn_bushing]) cylinder(d = btn_cap_d, h = btn_cap_h);


// Inside view: back cover + board + battery, no front shell (part="inside").
module phys_view() phys() {
  color("lightgrey") back_cover();
  electronics();
  if (battery == "18650") color("royalblue") translate([batt_cx - batt_l / 2, batt_cy, Df - batt_d / 2 - 1]) rotate([0, 90, 0]) cylinder(d = batt_d, h = batt_l);
  color("dimgray", 0.25) translate([pcb_x0, pcb_y0, front_t + panel_t]) cube([pcb_w, pcb_h, pcb_t]);
  // the right wall, cut through the USB opening
  color("white", 0.6) intersection() { front_shell(); translate([W - wall - 0.5, -1, -1]) cube([wall + 1, H + 2, Df + 1]); }
}

// Side cross-section through the middle (for checking the depth stack-up in renders).
if (part == "section") intersection() {
  translate([W / 2 - 0.4, -50, -50]) cube([0.8, H + 100, D + 100]);
  phys() union() {
    front_shell();
    back_cover();
    translate([pcb_x0, pcb_y0, front_t + panel_t]) cube([pcb_w, pcb_h, pcb_t]);
    electronics();
    translate([pcb_x0 + panel_x, pcb_y0 + panel_y, front_t]) cube([panel_w, panel_h, panel_t]);
    if (battery == "18650") translate([batt_cx - batt_l / 2, batt_cy, Df - batt_d / 2 - 1]) rotate([0, 90, 0]) cylinder(d = batt_d, h = batt_l);
  }
}
