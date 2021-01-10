import { xml } from '../src';

describe('x4e', () => {
    it('works', async () => {
        expect.assertions(1);

        const x = xml`<people class="example">
                <person id="1"><name>sam</name></person>
                <person id="2"><name>elizabeth</name></person>
            </people>`;

        console.log(x.person.name);
        console.log(x.person[0]?.name);

        expect(true).toBe(true);
    });
});
