import { useEffect, useState } from 'react';
import { useApp } from './state/app';
import { useWorkout } from './state/workout';
import { go, useRoute } from './lib/router';
import { repo } from './lib/repo';
import { Sheet } from './components/ui';
import { Survey } from './screens/Survey';
import { Proposal } from './screens/Proposal';
import { Picker } from './screens/Picker';
import { RoutineEdit } from './screens/RoutineEdit';
import { Home } from './screens/Home';
import { Workout } from './screens/Workout';
import { Summary } from './screens/Summary';
import { Calendar } from './screens/Calendar';
import { Settings } from './screens/Settings';
import { Pro } from './screens/Pro';

export function App() {
  const { loaded, load, profile, routine, toast } = useApp();
  const route = useRoute();
  const [pendingResume, setPendingResume] = useState(false);

  useEffect(() => {
    void load().then(async () => {
      // 진행 중이던 운동이 있으면(앱 종료·새로고침) 이어서 할지 묻기
      const active = await repo.getActive();
      if (active && location.hash !== '#/workout') setPendingResume(true);
    });
  }, []);

  // 첫 화면 결정: 설문 1회 → 루틴 1회 → 이후엔 항상 홈
  useEffect(() => {
    if (!loaded || route) return;
    go({ name: !profile ? 'survey' : !routine ? 'picker' : 'home' }, { replace: true });
  }, [loaded, route]);

  if (!loaded || !route) return null;

  let screen;
  switch (route.name) {
    case 'survey': screen = <Survey />; break;
    case 'proposal': screen = <Proposal />; break;
    case 'picker': screen = <Picker />; break;
    case 'routine': screen = <RoutineEdit />; break;
    case 'home': screen = <Home />; break;
    case 'workout': screen = <Workout />; break;
    case 'summary': screen = <Summary id={route.id} />; break;
    case 'calendar': screen = <Calendar />; break;
    case 'settings': screen = <Settings />; break;
    case 'pro': screen = <Pro />; break;
    default: screen = <Home />;
  }

  return (
    <>
      {screen}
      {toast && <div className="toast" role="status">{toast}</div>}
      {pendingResume && (
        <Sheet label="진행 중인 운동" onClose={() => setPendingResume(false)}>
          <h2>하던 운동이 있어요</h2>
          <p className="muted">앱이 닫히기 전 진행 상황을 저장해 뒀어요. 이어서 할까요?</p>
          <button className="btn primary block" onClick={async () => {
            setPendingResume(false);
            if (await useWorkout.getState().resume()) go({ name: 'workout' });
          }}>이어서 운동</button>
          <button className="btn ghost block" onClick={async () => {
            setPendingResume(false);
            const ok = await useWorkout.getState().resume();
            if (ok) {
              const id = await useWorkout.getState().finishAndSave();
              if (id) go({ name: 'summary', id });
            }
          }}>여기서 끝내고 저장</button>
        </Sheet>
      )}
    </>
  );
}
