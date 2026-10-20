# © 2026 김용현
# scripts/atlas/tests/test_unit.py — Python 단원 고르기(atlas_common.unit) 검사(2단계 G1). Node unit.mjs 와 같은 규칙.
import json, os, subprocess, sys, unittest

HERE = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
PROBE = ('import sys, json; sys.path.insert(0, sys.argv[1]); import atlas_common as a; u = a.unit(); '
         'sys.stdout.buffer.write(json.dumps({"id": u["id"], "sim": u["sim"], "config": a.UNIT_CONFIG, "maps": u["maps_path"], '
         '"work": a.unit_work("text/topics-check.json"), "argv": sys.argv[2:]}, ensure_ascii=False).encode("utf-8"))')


def probe(env_extra=None, args=()):
    env = {k: v for k, v in os.environ.items() if k not in ('ATLAS_UNIT', 'ATLAS_UNIT_CONFIG')}
    env.update(env_extra or {})
    r = subprocess.run([sys.executable, '-I', '-c', PROBE, HERE, *args], env=env, capture_output=True)
    if r.returncode != 0: raise AssertionError(r.stderr.decode('utf-8', 'replace'))
    return json.loads(r.stdout.decode('utf-8'))


class Unit(unittest.TestCase):
    def test_default_u2_same_config_string(self):
        o = probe()
        self.assertEqual(o['id'], 'u2')
        self.assertEqual(o['sim'], 'atlas-u2-asia')
        self.assertEqual(o['config'], os.path.join(HERE, 'config', 'u2.json'))   # 옛 UNIT_CONFIG 와 글자까지 같음
        self.assertTrue(o['maps'].replace('\\', '/').endswith('scripts/atlas/maps_u2.json'), o['maps'])

    def test_env_atlas_unit(self):
        o = probe({'ATLAS_UNIT': 'u3'})
        self.assertEqual(o['id'], 'u3')
        self.assertEqual(o['config'], os.path.join(HERE, 'config', 'u3.json'))

    def test_old_env_config_wins_as_is(self):
        p = os.path.join(HERE, 'config', 'u2.json')
        o = probe({'ATLAS_UNIT_CONFIG': p})
        self.assertEqual((o['id'], o['config']), ('u2', p))

    def test_argv_unit_first_and_stripped(self):
        o = probe({'ATLAS_UNIT': 'u2'}, ['--labels', '--unit', 'u3', '--check'])
        self.assertEqual(o['id'], 'u3')
        self.assertEqual(o['argv'], ['--labels', '--check'])   # 스크립트의 옵션 해석은 --unit 을 보지 않는다

    def test_unit_work(self):
        self.assertEqual(probe({'ATLAS_WORK': 'C:/W'})['work'], 'C:/W/text/topics-check.json')
        self.assertEqual(probe({'ATLAS_WORK': 'C:/W', 'ATLAS_UNIT': 'u3'})['work'], 'C:/W/units/u3/text/topics-check.json')

    def test_unknown_unit(self):
        with self.assertRaises(AssertionError) as cm: probe({'ATLAS_UNIT': 'u9'})
        self.assertIn('u9', str(cm.exception))


if __name__ == '__main__':
    unittest.main()
