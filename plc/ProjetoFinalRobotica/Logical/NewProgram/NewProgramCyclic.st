(********************************************************************
 * COPYRIGHT --  
 ********************************************************************
 * PROGRAM: NewProgram
 * File: NewProgramCyclic.st
 * Author: supervisorio
 * Created: May 29, 2026
 ********************************************************************
 * Whiteboard application (docs/whiteboard-application.md):
 *   1. Jaka puts the plate (NUM_PECAS parts in its holes) on the conveyor.
 *   2. The conveyor brings the plate TO the Staubli.
 *   3. Staubli puts the plate on its table AND the parts on the board.
 *   4. Staubli picks the marker from its table, draws a square around
 *      each part AND puts the marker back.
 * NUM_PECAS (NewProgram.var) is 1 FOR now: one part, one square.
 * Every robot task uses a four-phase handshake (no timers):
 *   PLC sets CMD -> robot sets DONE -> PLC clears CMD -> robot clears DONE.
 * One run per press OF the start button: Ligar is cleared at the end
 * OF the cycle AND on E-stop.
 ********************************************************************)
PROGRAM _CYCLIC

	TmrPulso(IN := Ligar AND Emergencia, PT := T#1s);
	TmrDI12(IN := Etapa = 2, PT := T#1s);
	
	IF Ligar AND Emergencia THEN
		
		Jaka_DI2 := NOT TmrPulso.Q;		//Pulse: ON for the first 1 s of the cycle, then OFF
		Staubli_DI13 := NOT TmrPulso.Q;
		LIGA_JAKA := TRUE;
		
		CASE Etapa OF

			0: (* Start *)
				PlacaNaEsteira := FALSE;
				PlacaChegou := FALSE;
				PecasNoQuadro := FALSE;
				CicloConcluido := FALSE;
				iPecasNoQuadro := 0;
				iQuadrados := 0;
				iTempoCiclo_s := 0;
				Jaka_DI3 := TRUE;						//CMD Jaka: put the plate on the conveyor
				Etapa := 1;

			1: (* Plate to the Staubli *)
				IF Jaka_DO7 = TRUE THEN
					//Jaka_DI3 := FALSE;					//Jaka done: plate on the conveyor
					PlacaNaEsteira := TRUE;
					Esteira_JakaStaubli := TRUE;
					Jaka_DI2 := FALSE;	//Carry the plate to the Staubli
				END_IF;

				IF Esteira_JakaStaubli AND Sensor_Staubli THEN
					Esteira_JakaStaubli := FALSE;		//Plate arrived
					PlacaChegou := TRUE;
				END_IF;

				//Wait for the Jaka to clear DONE
				IF PlacaChegou AND NOT Jaka_DO7 THEN
					Etapa := 2;
				END_IF;

			2: (* Staubli: plate on the table, parts on the board *)
				Staubli_DI12 := NOT TmrDI12.Q;			//CMD Staubli: plate to the table, parts to the board
				IF Staubli_DO4 THEN
					Staubli_DI12 := FALSE;				//Staubli done: parts on the board
					PecasNoQuadro := TRUE;
					iPecasNoQuadro := NUM_PECAS;
					Etapa := 3;
				END_IF;

			3: (* Wait for the Staubli to clear DONE *)
				IF NOT Staubli_DO4 THEN
					Etapa := 4;
				END_IF;

			4: (* Staubli: pick the marker, draw the squares, put the marker back *)
				Staubli_DI14 := TRUE;					//CMD Staubli: pick the marker and draw
				IF Staubli_DO5 THEN
					Staubli_DI14 := FALSE;				//Staubli done: squares drawn, marker stored
					iQuadrados := NUM_PECAS;
					Etapa := 5;
				END_IF;

			5: (* Finish: wait for the Staubli to clear DONE *)
				IF NOT Staubli_DO5 THEN
					iContador := iContador + 1;			//Completed cycles
					CicloConcluido := TRUE;
					Ligar := FALSE;						//One run per start; press Ligar again for the next
					Etapa := 0;
				END_IF;

		END_CASE;

	ELSE
		//Stop or E-stop: every command and enable goes FALS
		LIGA_JAKA := FALSE;
		Jaka_DI1 := FALSE;
		Jaka_DI2 := FALSE;
		Jaka_DI3 := FALSE;
		Staubli_DI12 := FALSE;
		Staubli_DI13 := FALSE;
		Staubli_DI14 := FALSE;
		Staubli_DI15 := FALSE;
		Esteira_JakaStaubli := FALSE;
		Esteira_StaubliJaka := FALSE;
		IF NOT Emergencia THEN
			Ligar := FALSE;							//Releasing the E-stop must not restart the cell
		END_IF;
		Etapa := 0;

		//Reset the process state too, so the HMI colors, counters and progress go back to "waiting".
		//Skipped right after a finished cycle: CicloConcluido stays TRUE until the next start,
		//so the "done" state and the cycle time stay on screen.
		IF NOT CicloConcluido THEN
			PlacaNaEsteira := FALSE;
			PlacaChegou := FALSE;
			PecasNoQuadro := FALSE;
			iPecasNoQuadro := 0;
			iQuadrados := 0;
			iTempoCiclo_s := 0;
		END_IF;
	END_IF;

	//Progress counters from the robots' optional pulses (Staubli DO6 = part placed, DO7 = square drawn)
	PulsoPeca(CLK := Staubli_DO6);
	IF PulsoPeca.Q AND Etapa = 2 AND iPecasNoQuadro < NUM_PECAS THEN
		iPecasNoQuadro := iPecasNoQuadro + 1;
	END_IF;
	PulsoQuadrado(CLK := Staubli_DO7);
	IF PulsoQuadrado.Q AND Etapa = 4 AND iQuadrados < NUM_PECAS THEN
		iQuadrados := iQuadrados + 1;
	END_IF;

	//Cycle time (kept on screen after the cycle ends)
	TempoCiclo(IN := Etapa > 0, PT := T#30m);
	IF Etapa > 0 THEN
		iTempoCiclo_s := DINT_TO_INT(TIME_TO_DINT(TempoCiclo.ET) / 1000);
	END_IF;

	//Where the plate is: 0 = Jaka, 1 = conveyor, 2 = Staubli
	IF PlacaChegou THEN
		iPlaca := 2;
	ELSIF PlacaNaEsteira THEN
		iPlaca := 1;
	ELSE
		iPlaca := 0;
	END_IF;

	//HMI colors (palette index): COR_ESPERA = waiting, COR_ANDAMENTO = running, COR_FEITO = done
	IF PlacaNaEsteira THEN iCorJaka := COR_FEITO; ELSIF Jaka_DI3 THEN iCorJaka := COR_ANDAMENTO; ELSE iCorJaka := COR_ESPERA; END_IF;
	IF PlacaChegou THEN iCorEsteira := COR_FEITO; ELSIF Esteira_JakaStaubli THEN iCorEsteira := COR_ANDAMENTO; ELSE iCorEsteira := COR_ESPERA; END_IF;
	IF PecasNoQuadro THEN iCorPecas := COR_FEITO; ELSIF Staubli_DI12 THEN iCorPecas := COR_ANDAMENTO; ELSE iCorPecas := COR_ESPERA; END_IF;
	IF CicloConcluido OR Etapa = 5 THEN iCorDesenho := COR_FEITO; ELSIF Etapa = 4 THEN iCorDesenho := COR_ANDAMENTO; ELSE iCorDesenho := COR_ESPERA; END_IF;
	IF CicloConcluido THEN iCorConcluido := COR_FEITO; ELSIF Etapa = 5 THEN iCorConcluido := COR_ANDAMENTO; ELSE iCorConcluido := COR_ESPERA; END_IF;

	//Whiteboard (one part and its square on the HMI)
	IF iPecasNoQuadro >= 1 THEN iCorPeca := COR_PECA; ELSE iCorPeca := COR_VAZIO; END_IF;
	IF iQuadrados >= 1 THEN iCorQuadrado := COR_TINTA; ELSE iCorQuadrado := COR_QUADRO; END_IF;

	IF iPlaca = 0 THEN iCorPlacaJaka := COR_FEITO; ELSE iCorPlacaJaka := COR_ESPERA; END_IF;
	IF iPlaca = 1 THEN iCorPlacaEsteira := COR_FEITO; ELSE iCorPlacaEsteira := COR_ESPERA; END_IF;
	IF iPlaca = 2 THEN iCorPlacaStaubli := COR_FEITO; ELSE iCorPlacaStaubli := COR_ESPERA; END_IF;

	IF NOT Emergencia THEN iCorEmergencia := COR_ALARME; ELSE iCorEmergencia := COR_ESPERA; END_IF;

	iProgresso := iPecasNoQuadro + iQuadrados;	//0..2*NUM_PECAS on the progress bar

	//Digital twin: send the I/O state to the bridge PC (TwinSender.st)
	TwinSender;

END_PROGRAM