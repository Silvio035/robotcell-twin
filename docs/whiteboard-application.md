# Whiteboard application

Status: **implemented** in the PLC program, the HMI and the twin. The PLC
code and the HMI page have not been compiled yet (first build on the lab
PC). The robot programs still have to be written following the table below.

## The application

On the Jaka side: a grey plate with 3 square holes in a triangle (two at
the far edge, one in the middle of the near edge), located on the table by
four L-shaped corner guides. The plate carries two square blocks: one
fixed between the two far holes is the handle, where both robots grip the
plate, and the real part sits in the middle hole. On the Stäubli table: the whiteboard in front
of the Stäubli (between the robot and the end of the conveyor) and the
marker in its holder. The plate has no stand there; the Stäubli lays it on
the table beside the board.

> **One part for now.** The application starts with a single part (one
> square). The part count is one constant in each place: `NUM_PECAS` in
> `NewProgram.var` and `PART_COUNT` (from `LAYOUT.plate.partSpots` /
> `LAYOUT.boardSlots`) in `src/model/layout.ts`. Going back to two parts
> means raising both, adding a plate spot and a board slot in the layout,
> the second part and square on the HMI page and the second pulses in
> `src/sim/timeline.json`.

1. The Jaka picks the plate and puts it on the Jaka → Stäubli conveyor.
2. The conveyor brings the plate to the Stäubli (the only use of the conveyor).
3. The Stäubli lays the plate on its table, then takes the part off the
   plate and stands it on the board.
4. The Stäubli picks the marker, draws a square around the part and puts
   the marker back in its holder.

The part stays upright the whole time (the Stäubli gripper is vertical)
and is gripped by two sides.

Times measured on the cell: the Jaka takes about 14 s from the command
(`DI3`) to the plate released on the conveyor, the conveyor about 7 s to
bring the plate to the Stäubli sensor, and the Stäubli about 8 s to draw
the square. The twin's defaults and the demo run use these values; with
the real cell the twin also refines each duration from the runs it sees.

For the next run the operator puts the plate with the part back at the
Jaka, takes the part off the board and wipes it, then presses **Ligar**.

How it fits the assignment:

| Requirement | Fit | Check |
|---|---|---|
| Three or more pieces moved in coordination, both robots | Plate + part + marker; the plate goes from one robot to the other | Confirm with the professor that the plate and the marker count as pieces |
| Controlled by the PLC/HMI, 7 min maximum | One run is well under a minute | Cycle time on the HMI |
| Layout cannot change, external peripherals allowed | Plate, plate guides, whiteboard and marker holder are peripherals | |
| Repeatability and precision | A part taken from a hole and a square drawn around it show precision visually | |

## Handshake rule

Every robot task uses a four-phase handshake, without timers:

1. PLC sets the command bit.
2. Robot does the task and sets its done bit.
3. PLC sees done and clears the command.
4. Robot sees the command cleared and clears done.

This gives the twin an exact event at every phase boundary.

## Signal allocation

Only signals that are already wired (Table I) are used. The PLC side is in
[plc-program.md](plc-program.md#io-mapping).

| Signal | Channel | Meaning |
|---|---|---|
| `Jaka_DI2` | DO 2 | **Start pulse**: TRUE for the first second of the cycle |
| `Jaka_DI3` | DO 1 | **CMD**: put the plate on the conveyor |
| `Jaka_DO7` | DI 1 | **DONE**: plate on the conveyor |
| `Jaka_DO5` | DI 3 | Pulse: plate gripped (twin only, optional) |
| `Staubli_DI13` | DO 6 | **Start pulse**: TRUE for the first second of the cycle |
| `Staubli_DI12` | DO 5 | **CMD**: take the plate, lay it on the table, put the part on the board |
| `Staubli_DO4` | DI 5 | **DONE**: part on the board |
| `Staubli_DI14` | DO 7 | **CMD**: pick the marker, draw the square, put the marker back |
| `Staubli_DO5` | DI 6 | **DONE**: square drawn, marker stored |
| `Staubli_DO6` | DI 7 | Pulse: one part placed on the board (HMI counter, twin) |
| `Staubli_DO7` | DI 8 | Pulse: one square drawn (HMI counter, twin) |
| `Sensor_Jaka` | DI 10 | Plate on the conveyor at the Jaka end |
| `Sensor_Staubli` | DI 9 | Plate arrived at the Stäubli end |
| `Esteira_JakaStaubli` | DO 12 | Carries the plate |
| `Jaka_DI1`, `Jaka_DO6`, `Staubli_DI15`, `Esteira_StaubliJaka` | | Spare |

## Robot programs

| Robot | Program |
|---|---|
| Jaka | Wait for `DI3` → pick the plate by its handle (pulse `DO5`) → place it at the conveyor start → lift clear → pulse `DO7` (set, about 0.5 s, clear) → home. `DI3` stays on for the whole cycle, so do not wait for it to drop |
| Stäubli, command 1 | Wait for `DI12` → pick the plate at the conveyor end → lay it on the table → part: hole → board, pulse `DO6` → home → set `DO4` → wait for `DI12` FALSE (a 1 s pulse, already over) → clear `DO4` |
| Stäubli, command 2 | Wait for `DI14` → pick the marker → square around the part (`movel` at fixed Z), pulse `DO7` → put the marker back → home → set `DO5` → wait for `DI14` FALSE → clear `DO5` |

Pulses: about 200 ms, so the PLC (10 ms cycle) and the twin (200 ms packets)
both see them. `DI2` / `DI13` are only 1 s start pulses now; the robots do
not use them as an enable.

Practical points:

- **Gripping the plate.** The Jaka gripper (SMC MHZ2-20D) opens about 10 mm
  in total, so it cannot close around the plate. Both robots take the plate
  by the handle block fixed on it, the same size as a part.
- **Plate on the Stäubli table.** There is no stand: the plate lies on the
  table, so the Stäubli's J3 stroke must reach the table surface (the twin
  assumes a 200 mm stroke from a 200 mm top height). Always laying it in the
  same place keeps the part at a fixed spot for the pick.
- **Parts.** The part sits in the middle hole and stands on whatever is
  under the plate, so its pick height is that surface plus the grip height
  (`LAYOUT.part.gripZ`).
- **Drawing.** A SCARA is a good fit: straight lines at a fixed height. A
  spring-loaded marker holder on the gripper keeps the pressure even if the
  board is not perfectly flat.
- The Stäubli must hold the plate, the parts and the marker. Check its gripper.

## PLC and HMI

Sequence, HMI page and variables: [plc-program.md](plc-program.md#sequence).

## In the twin

See [robot-estimation.md](robot-estimation.md). In short: the website
follows the same tasks from the PLC signals, shows the plate and its parts
on the conveyor and in the grippers, the parts standing on the board, and
draws the ink of the squares while the Stäubli draws. The ink follows the
taught square corners, not what is really on the board: the twin knows when
a square starts and ends, not whether the pen touched.
